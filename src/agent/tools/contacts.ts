import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { findContacts } from "../../google/contacts.js";
import { guard, type Turn } from "./common.js";

export function contactTools({ user }: Turn) {
  const guarded = guard(user);
  return [
    betaZodTool({
      name: "find_contact",
      description:
        "Look someone up in the user's Google Contacts, including people they've emailed but never saved. Returns names, emails, and phone numbers. Use it before asking the user for someone's address.",
      inputSchema: z.object({ query: z.string().describe("Name, part of a name, or email, e.g. 'maya'") }),
      run: guarded(async ({ query }) => {
        const results = await findContacts(user.id, query);
        return results.length ? JSON.stringify(results) : "No contacts matched.";
      }),
    }),
  ];
}
