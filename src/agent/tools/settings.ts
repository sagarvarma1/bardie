import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "../../db.js";
import { revokeGoogle } from "../../google/oauth.js";
import { isValidTimeZone } from "../../time.js";
import { deleteUser, setMorningBrief, setTimezone } from "../../users.js";
import { guard, type Turn } from "./common.js";

export function settingsTools(turn: Turn) {
  const { user, turnId } = turn;
  const guarded = guard(user);
  return [
    betaZodTool({
      name: "set_timezone",
      description:
        "Save the user's timezone when they tell you where they are or that they moved/are traveling. Existing reminders keep their exact moment in time.",
      inputSchema: z.object({ timezone: z.string().describe("IANA name, e.g. America/New_York, Europe/London") }),
      run: guarded(async ({ timezone }) => {
        if (!isValidTimeZone(timezone)) return `"${timezone}" isn't a valid IANA timezone name.`;
        setTimezone(user.id, timezone);
        user.timezone = timezone;
        return `Timezone set to ${timezone}.`;
      }),
    }),
    betaZodTool({
      name: "set_morning_brief",
      description:
        "Turn the daily morning text (today's plans plus anything urgent in email) on or off, or change its time. It's on at 08:00 by default.",
      inputSchema: z.object({
        enabled: z.boolean(),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional()
          .describe("Local time, HH:MM 24-hour"),
      }),
      run: guarded(async ({ enabled, time }) => {
        setMorningBrief(user.id, enabled, time);
        return enabled ? `Morning brief on${time ? ` at ${time}` : ""}.` : "Morning brief off.";
      }),
    }),
    betaZodTool({
      name: "delete_my_account",
      description:
        "Permanently delete the user's account and everything Bardie has (history, memories, reminders, drafts) and revoke Google access. Two steps: call with confirm=false when they ask, tell them what will be deleted and ask them to confirm; call with confirm=true only after they confirm in a later message.",
      inputSchema: z.object({ confirm: z.boolean() }),
      run: guarded(async ({ confirm }) => {
        if (!confirm) {
          db.prepare("UPDATE users SET delete_requested_turn = ? WHERE id = ?").run(turnId, user.id);
          return "Asked. Tell them everything will be deleted (chat history, memories, reminders, Google connection) and ask them to confirm.";
        }
        const row = db.prepare("SELECT delete_requested_turn FROM users WHERE id = ?").get(user.id) as
          | { delete_requested_turn: number | null }
          | undefined;
        // The confirmation has to come after the user saw the warning.
        if (!row?.delete_requested_turn || row.delete_requested_turn >= turnId) {
          return "Not deleted: ask them to confirm first (call with confirm=false).";
        }
        await revokeGoogle(user.id);
        deleteUser(user.phone);
        turn.accountDeleted = true;
        return "Deleted. Send one short goodbye. To use Bardie again they'd sign up again on the website.";
      }),
    }),
  ];
}
