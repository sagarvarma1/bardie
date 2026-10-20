import { runAgentTurn } from "./agent/agent.js";
import { withUserLock } from "./agent/lock.js";
import { config, openSignups } from "./config.js";
import { db } from "./db.js";
import type { Responder } from "./gateway.js";
import { localClock, userTz, zonedToUtc } from "./time.js";
import { activateUser, createActiveUser, findUserByPhone, setConversationId, type User } from "./users.js";

/**
 * Daily cost cap. Counts texts the user sent today (their local day; reminders
 * and other [event] turns don't count). At the limit, Bardie says so once and
 * then stays silent until tomorrow, without storing the extra texts.
 */
function overDailyLimit(user: User): { notice?: string } | null {
  const tz = userTz(user);
  const today = localClock(new Date(), tz).date;
  // messages.created_at is SQLite's "YYYY-MM-DD HH:MM:SS" in UTC.
  const since = zonedToUtc(today, tz).toISOString().replace("T", " ").slice(0, 19);
  const { n } = db
    .prepare(
      "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND role = 'user' AND created_at >= ? AND content NOT LIKE '[event]%'",
    )
    .get(user.id, since) as { n: number };
  if (n < config.dailyMessageLimit) return null;
  if (user.capped_date === today) return {};
  db.prepare("UPDATE users SET capped_date = ? WHERE id = ?").run(today, user.id);
  return { notice: "i'm tapped out for today, back tomorrow morning ☀️" };
}

/**
 * Every message goes to the agent; there are no keyword commands. The only
 * logic here is who gets in: a registered number's first text activates it
 * (only the owner can text from that number), and with open signups (a
 * dedicated line, or console mode) any new number is signed up on the spot.
 */
export const respond: Responder = async (msg) => {
  let user = findUserByPhone(msg.senderId);
  let firstMessage = false;

  if (!user) {
    if (!openSignups()) {
      console.log(`[bot] ignoring message from unknown sender ${msg.senderId}`);
      return null;
    }
    user = createActiveUser(msg.senderId);
    if (!user) return `${config.appName} is full right now. We'll let you know when there's room!`;
    firstMessage = true;
  } else if (activateUser(user.id)) {
    firstMessage = true;
  }

  if (user.conversation_id !== msg.conversationId) setConversationId(user.id, msg.conversationId);
  const capped = overDailyLimit(user);
  if (capped) {
    console.log(`[bot] user ${user.id} is over the daily limit`);
    return capped.notice ?? null;
  }
  const current = { ...user, conversation_id: msg.conversationId };
  return withUserLock(user.id, () =>
    runAgentTurn(current, msg.text, {
      firstMessage,
      media: msg.media,
      reactionTo: msg.reactionTo,
      inbound: { conversationId: msg.conversationId, messageId: msg.id },
    }),
  );
};
