import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { googleClientFor } from "./oauth.js";

const BODY_LIMIT = 12_000;

function api(userId: number): gmail_v1.Gmail {
  return gmail({ version: "v1", auth: googleClientFor(userId) });
}

function header(msg: gmail_v1.Schema$Message, name: string): string {
  return msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeB64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prefers text/plain; falls back to stripped text/html. */
function extractBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  const find = (p: gmail_v1.Schema$MessagePart, mime: string): string | undefined => {
    if (p.mimeType === mime && p.body?.data) return decodeB64Url(p.body.data);
    for (const child of p.parts ?? []) {
      const found = find(child, mime);
      if (found) return found;
    }
    return undefined;
  };
  const plain = find(part, "text/plain");
  if (plain) return plain.trim();
  const html = find(part, "text/html");
  return html ? htmlToText(html) : "";
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
}

function summarize(msg: gmail_v1.Schema$Message): EmailSummary {
  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    from: header(msg, "From"),
    to: header(msg, "To"),
    subject: header(msg, "Subject") || "(no subject)",
    date: header(msg, "Date"),
    snippet: msg.snippet ?? "",
    labels: msg.labelIds ?? [],
  };
}

async function getMetadata(g: gmail_v1.Gmail, id: string): Promise<EmailSummary> {
  const res = await g.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: ["From", "To", "Subject", "Date"],
  });
  return summarize(res.data);
}

/** Gmail search syntax, e.g. "from:alex newer_than:7d" or "is:unread in:inbox". */
export async function searchEmails(userId: number, query: string, max = 10): Promise<EmailSummary[]> {
  const g = api(userId);
  const res = await g.users.messages.list({ userId: "me", q: query, maxResults: Math.min(max, 25) });
  return Promise.all((res.data.messages ?? []).map((m) => getMetadata(g, m.id!)));
}

export async function readEmail(userId: number, id: string): Promise<EmailSummary & { body: string; truncated: boolean }> {
  const res = await api(userId).users.messages.get({ userId: "me", id, format: "full" });
  const body = extractBody(res.data.payload);
  return {
    ...summarize(res.data),
    body: body.slice(0, BODY_LIMIT),
    truncated: body.length > BODY_LIMIT,
  };
}

function encodeHeader(value: string): string {
  // RFC 2047 for non-ASCII subjects/names.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

export interface DraftInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  replyToEmailId?: string;
}

export async function createDraft(userId: number, input: DraftInput): Promise<{ draftId: string; subject: string }> {
  const g = api(userId);
  let subject = input.subject;
  let threadId: string | undefined;
  const extraHeaders: string[] = [];

  if (input.replyToEmailId) {
    const orig = await g.users.messages.get({
      userId: "me",
      id: input.replyToEmailId,
      format: "metadata",
      metadataHeaders: ["Subject", "Message-ID", "References"],
    });
    threadId = orig.data.threadId ?? undefined;
    const messageId = header(orig.data, "Message-ID");
    if (messageId) {
      extraHeaders.push(`In-Reply-To: ${messageId}`);
      extraHeaders.push(`References: ${[header(orig.data, "References"), messageId].filter(Boolean).join(" ")}`);
    }
    const origSubject = header(orig.data, "Subject");
    if (!subject) subject = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`;
  }

  const res = await g.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: buildRaw({ ...input, subject }, extraHeaders), threadId } },
  });
  return { draftId: res.data.id!, subject };
}

/** A plain-text RFC 2822 message, base64url-encoded for the Gmail API. */
function buildRaw(input: { to: string; cc?: string; subject: string; body: string }, extraHeaders: string[] = []): string {
  const raw = [
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    ...extraHeaders,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.body).toString("base64"),
  ].join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

/** Sends a new email directly. Works with only the gmail.send scope. */
export async function sendEmail(userId: number, input: { to: string; cc?: string; subject: string; body: string }): Promise<void> {
  await api(userId).users.messages.send({ userId: "me", requestBody: { raw: buildRaw(input) } });
}

export async function sendDraft(userId: number, draftId: string): Promise<void> {
  await api(userId).users.drafts.send({ userId: "me", requestBody: { id: draftId } });
}

/**
 * New inbox messages since `historyId`. Returns the next cursor. If the cursor
 * is too old (Gmail keeps ~a week), resets to now and returns no messages.
 */
export async function newInboxMessages(
  userId: number,
  historyId: string | null,
): Promise<{ messages: EmailSummary[]; nextHistoryId: string }> {
  const g = api(userId);
  if (!historyId) {
    const profile = await g.users.getProfile({ userId: "me" });
    return { messages: [], nextHistoryId: profile.data.historyId! };
  }

  const ids = new Set<string>();
  let nextHistoryId = historyId;
  let pageToken: string | undefined;
  try {
    do {
      const res = await g.users.history.list({
        userId: "me",
        startHistoryId: historyId,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
        pageToken,
      });
      for (const h of res.data.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }
      nextHistoryId = res.data.historyId ?? nextHistoryId;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    if ((err as { code?: number }).code === 404) {
      const profile = await g.users.getProfile({ userId: "me" });
      return { messages: [], nextHistoryId: profile.data.historyId! };
    }
    throw err;
  }

  const messages = await Promise.all([...ids].slice(0, 20).map((id) => getMetadata(g, id).catch(() => null)));
  return {
    messages: messages.filter((m): m is EmailSummary => m !== null && m.labels.includes("INBOX")),
    nextHistoryId,
  };
}

/** Ids of messages matching a Gmail search, up to `cap`. */
export async function idsForQuery(userId: number, query: string, cap = 500): Promise<string[]> {
  const g = api(userId);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await g.users.messages.list({ userId: "me", q: query, maxResults: Math.min(500, cap - ids.length), pageToken });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < cap);
  return ids;
}

/** Adds/removes labels (by id) on many messages, e.g. remove INBOX to archive, UNREAD to mark read. */
export async function modifyEmails(
  userId: number,
  ids: string[],
  labels: { add?: string[]; remove?: string[] },
): Promise<void> {
  const g = api(userId);
  for (let i = 0; i < ids.length; i += 1000) {
    await g.users.messages.batchModify({
      userId: "me",
      requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: labels.add, removeLabelIds: labels.remove },
    });
  }
}

/** Moves messages to Trash (Gmail deletes them for good after 30 days). */
export async function trashEmails(userId: number, ids: string[]): Promise<void> {
  const g = api(userId);
  for (const id of ids) await g.users.messages.trash({ userId: "me", id });
}

/** The id of a user label with this name, creating it if needed. */
export async function labelId(userId: number, name: string): Promise<string> {
  const g = api(userId);
  const labels = (await g.users.labels.list({ userId: "me" })).data.labels ?? [];
  const existing = labels.find((l) => l.name?.toLowerCase() === name.toLowerCase());
  if (existing?.id) return existing.id;
  const created = await g.users.labels.create({
    userId: "me",
    requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
  });
  return created.data.id!;
}
