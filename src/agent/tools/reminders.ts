import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { cancelReminder, createReminder, pendingReminders } from "../../reminders.js";
import { formatLocal, userTz, zonedToUtc } from "../../time.js";
import { guard, type Turn } from "./common.js";

export function reminderTools({ user }: Turn) {
  const guarded = guard(user);
  const tz = userTz(user);

  return [
    betaZodTool({
      name: "set_reminder",
      description:
        "Schedule yourself to text the user later. Use it for reminders they ask for, and for follow-ups you think they'd want (e.g. check tomorrow whether someone replied). When it's due, you get the note back and can use your other tools before texting, or stay silent if it's no longer relevant.",
      inputSchema: z.object({
        when: z.string().describe("Local time in the user's timezone, YYYY-MM-DDTHH:MM"),
        note: z
          .string()
          .describe(
            "Note to your future self: what to text or check, with enough context to act on it later (e.g. 'remind them to pay rent, $2,100 to Mark' or 'check if the landlord replied about the plumber; only text if he did')",
          ),
        repeat: z.enum(["daily", "weekly"]).optional(),
      }),
      run: guarded(async ({ when, note, repeat }) => {
        const runAt = zonedToUtc(when, tz);
        if (runAt.getTime() < Date.now() - 60_000) return "That time has already passed. Pick a future time.";
        const id = createReminder(user.id, runAt, note, repeat ?? null);
        return `Scheduled (reminder ${id}) for ${formatLocal(runAt, tz)}${repeat ? `, repeating ${repeat}` : ""}.`;
      }),
    }),
    betaZodTool({
      name: "list_reminders",
      description: "List the reminders and follow-ups you have scheduled for the user.",
      inputSchema: z.object({}),
      run: guarded(async () => {
        const reminders = pendingReminders(user.id);
        if (!reminders.length) return "Nothing scheduled.";
        return JSON.stringify(
          reminders.map((r) => ({ id: r.id, when: formatLocal(new Date(r.run_at), tz), note: r.note, repeat: r.repeat })),
        );
      }),
    }),
    betaZodTool({
      name: "cancel_reminder",
      description: "Cancel a scheduled reminder or follow-up by id (from list_reminders).",
      inputSchema: z.object({ reminder_id: z.number().int() }),
      run: guarded(async ({ reminder_id }) =>
        cancelReminder(user.id, reminder_id) ? "Cancelled." : "No pending reminder with that id.",
      ),
    }),
  ];
}
