import { randomBytes } from "node:crypto";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "../../db.js";
import {
  createDraft,
  idsForQuery,
  labelId,
  modifyEmails,
  readEmail,
  searchEmails,
  sendDraft,
  sendEmail,
  trashEmails,
} from "../../google/gmail.js";
import {
  createConnectLink,
  getGoogleAccount,
  type googleStatus,
  GoogleNotConnectedError,
} from "../../google/oauth.js";
import { guard, type Turn } from "./common.js";

// Bulk actions take ids from search_emails, or a Gmail query for "all promos older than a week".
const selection = {
  email_ids: z.array(z.string()).optional().describe("Specific email ids from search_emails"),
  query: z.string().optional().describe("Or a Gmail search; every match is affected (up to 500)"),
};

async function selectIds(userId: number, input: { email_ids?: string[]; query?: string }): Promise<string[]> {
  if (input.email_ids?.length) return input.email_ids;
  if (input.query) return idsForQuery(userId, input.query);
  return [];
}

interface DraftRow {
  status: string;
  created_turn: number;
  to_addr: string;
  cc: string | null;
  subject: string;
  body: string | null;
  local: number;
}

/**
 * Email tools for what this user can do: reading and cleanup need gmail.modify;
 * drafting and sending work with gmail.modify (real Gmail drafts) or with just
 * gmail.send (drafts Bardie keeps itself until the user approves).
 */
export function emailTools({ user, turnId }: Turn, google: ReturnType<typeof googleStatus>) {
  const guarded = guard(user);
  const connectTool = betaZodTool({
    name: "get_gmail_connect_link",
    description:
      "Create a one-tap link (valid 30 minutes) the user opens to connect or reconnect their Google account (Gmail, Calendar, Contacts). Send them the link exactly as returned.",
    inputSchema: z.object({}),
    run: async () => {
      const account = getGoogleAccount(user.id);
      const link = createConnectLink(user.id);
      return account
        ? `Already connected as ${account.email}. To reconnect or switch accounts, this link works: ${link}`
        : link;
    },
  });

  const readTools = [
    betaZodTool({
      name: "search_emails",
      description:
        "Search the user's Gmail. Uses Gmail search syntax, e.g. 'in:inbox is:unread', 'from:alex newer_than:7d', 'subject:reservation'. Returns id, from, subject, date, and a snippet for each match.",
      inputSchema: z.object({
        query: z.string().describe("Gmail search query"),
        max_results: z.number().int().min(1).max(25).optional().describe("Default 10"),
      }),
      run: guarded(async ({ query, max_results }) => {
        const results = await searchEmails(user.id, query, max_results ?? 10);
        if (results.length === 0) return "No emails matched.";
        return JSON.stringify(results.map(({ labels: _labels, ...r }) => r));
      }),
    }),
    betaZodTool({
      name: "read_email",
      description: "Read the full body of one email by id (from search_emails).",
      inputSchema: z.object({ email_id: z.string() }),
      run: guarded(async ({ email_id }) => {
        const email = await readEmail(user.id, email_id);
        return (
          `<email id="${email.id}" thread="${email.threadId}">\nFrom: ${email.from}\nTo: ${email.to}\nDate: ${email.date}\nSubject: ${email.subject}\n\n${email.body}` +
          (email.truncated ? "\n[body truncated]" : "") +
          "\n</email>"
        );
      }),
    }),
  ];

  // Real Gmail drafts need gmail.modify; with only gmail.send, Bardie keeps the draft.
  const gmailDrafts = google.granted.readMail;
  const sendTools = [
    betaZodTool({
      name: "draft_email",
      description: gmailDrafts
        ? "Create a Gmail draft (does NOT send). For replies, pass reply_to_email_id so it threads correctly; subject can then be empty. After drafting, show the user the draft and ask before sending."
        : "Prepare an email (does NOT send). New emails only: replying to an existing thread isn't possible yet. After drafting, show the user the draft and ask before sending.",
      inputSchema: z.object({
        to: z.string().describe("Recipient email address(es), comma-separated"),
        subject: z.string().describe(gmailDrafts ? "Subject line; may be empty for replies" : "Subject line"),
        body: z.string().describe("Plain-text email body, signed as the user would sign it"),
        cc: z.string().optional(),
        reply_to_email_id: z.string().optional(),
      }),
      run: guarded(async (input) => {
        let draftId: string;
        let subject = input.subject;
        if (gmailDrafts) {
          const draft = await createDraft(user.id, {
            to: input.to,
            subject: input.subject,
            body: input.body,
            cc: input.cc,
            replyToEmailId: input.reply_to_email_id,
          });
          draftId = draft.draftId;
          subject = draft.subject;
        } else {
          if (!getGoogleAccount(user.id)) throw new GoogleNotConnectedError();
          if (input.reply_to_email_id) return "Replying to an email isn't possible yet, only new emails.";
          draftId = `local-${randomBytes(6).toString("hex")}`;
        }
        db.prepare(
          "INSERT INTO drafts (draft_id, user_id, to_addr, subject, created_turn, body, cc, local) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(draftId, user.id, input.to, subject, turnId, gmailDrafts ? null : input.body, input.cc ?? null, gmailDrafts ? 0 : 1);
        return `Draft created (draft_id ${draftId}) to ${input.to}, subject "${subject}". Show it to the user and ask whether to send. Include [ref: draft_id=${draftId}] at the end of your reply.`;
      }),
    }),
    betaZodTool({
      name: "send_draft",
      description: "Send a draft the user has already seen and explicitly approved in their latest message.",
      inputSchema: z.object({ draft_id: z.string() }),
      run: guarded(async ({ draft_id }) => {
        const draft = db.prepare("SELECT * FROM drafts WHERE draft_id = ? AND user_id = ?").get(draft_id, user.id) as
          | DraftRow
          | undefined;
        if (!draft) return "No such draft.";
        if (draft.status === "sent") return "That draft was already sent.";
        // The user must have seen the draft in an earlier reply before it can go out.
        if (draft.created_turn >= turnId) {
          return "Not sent: the user hasn't seen this draft yet. Show it to them and wait for their confirmation.";
        }
        if (draft.local) {
          await sendEmail(user.id, {
            to: draft.to_addr,
            cc: draft.cc ?? undefined,
            subject: draft.subject,
            body: draft.body ?? "",
          });
        } else {
          await sendDraft(user.id, draft_id);
        }
        db.prepare("UPDATE drafts SET status = 'sent' WHERE draft_id = ?").run(draft_id);
        return `Sent to ${draft.to_addr}.`;
      }),
    }),
  ];

  const cleanupTools = [
    betaZodTool({
      name: "archive_emails",
      description:
        "Archive emails (remove from inbox; still searchable, nothing deleted). Pass ids, or a query for bulk cleanup like 'in:inbox category:promotions older_than:7d'. Returns how many.",
      inputSchema: z.object(selection),
      run: guarded(async (input) => {
        const ids = await selectIds(user.id, input);
        if (!ids.length) return "Nothing matched.";
        await modifyEmails(user.id, ids, { remove: ["INBOX"] });
        return `Archived ${ids.length}.`;
      }),
    }),
    betaZodTool({
      name: "mark_emails_read",
      description: "Mark emails as read. Pass ids, or a query like 'in:inbox is:unread from:linkedin.com'. Returns how many.",
      inputSchema: z.object(selection),
      run: guarded(async (input) => {
        const ids = await selectIds(user.id, input);
        if (!ids.length) return "Nothing matched.";
        await modifyEmails(user.id, ids, { remove: ["UNREAD"] });
        return `Marked ${ids.length} read.`;
      }),
    }),
    betaZodTool({
      name: "label_emails",
      description: "Put a Gmail label on emails (created if it doesn't exist), e.g. 'Receipts' or 'Taxes 2026'.",
      inputSchema: z.object({ ...selection, label: z.string() }),
      run: guarded(async ({ label, ...input }) => {
        const ids = await selectIds(user.id, input);
        if (!ids.length) return "Nothing matched.";
        await modifyEmails(user.id, ids, { add: [await labelId(user.id, label)] });
        return `Labeled ${ids.length} "${label}".`;
      }),
    }),
    betaZodTool({
      name: "trash_emails",
      description:
        "Move specific emails to Trash. Only when the user says to delete them; for cleanup, archive instead. Ids only, max 25. Recoverable from Trash for 30 days.",
      inputSchema: z.object({ email_ids: z.array(z.string()).min(1).max(25) }),
      run: guarded(async ({ email_ids }) => {
        await trashEmails(user.id, email_ids);
        return `Moved ${email_ids.length} to Trash.`;
      }),
    }),
  ];

  return [
    ...(google.canConnect ? [connectTool] : []),
    ...(google.available.readMail ? [...readTools, ...cleanupTools] : []),
    ...(google.available.sendMail ? sendTools : []),
  ];
}
