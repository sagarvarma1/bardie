import { config } from "../config.js";
import { db } from "../db.js";
import { createConnectLink, googleStatus } from "../google/oauth.js";
import { notifyUser } from "../notifier.js";
import {
  dueReminders,
  markReminderDone,
  type Reminder,
  rescheduleReminder,
} from "../reminders.js";
import { addLocalDays, formatLocal, localClock, userTz } from "../time.js";
import { findUserById, type User } from "../users.js";
import { runAgentTurn } from "./agent.js";
import { withUserLock } from "./lock.js";

// Everything Bardie texts on its own schedule: reminders and follow-ups the
// agent set, and the morning brief. Each one is a full agent turn, so Bardie
// can check email, calendar, or the web first, or decide to stay quiet.

const TICK_SECONDS = 30;
const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 5;
/** The brief only goes out this long after brief_time, so late signups don't get one at 4pm. */
const BRIEF_WINDOW_MINUTES = 120;

/** Runs a background turn for a user and texts the result, if any. */
async function textFirst(user: User, event: string): Promise<void> {
  const reply = await withUserLock(user.id, () => runAgentTurn(user, event, { background: true }));
  if (reply) await notifyUser(user.id, reply, undefined, false);
}

async function runReminder(reminder: Reminder, now: Date): Promise<void> {
  const user = findUserById(reminder.user_id);
  if (!user || user.status !== "active" || !user.conversation_id) {
    markReminderDone(reminder.id);
    return;
  }
  const tz = userTz(user);

  // Claim it before the slow part, so a crash can't send it twice.
  if (reminder.repeat) {
    let next = new Date(reminder.run_at);
    const step = reminder.repeat === "daily" ? 1 : 7;
    while (next <= now) next = addLocalDays(next, step, tz);
    rescheduleReminder(reminder.id, next);
  } else {
    markReminderDone(reminder.id);
  }

  const late = now.getTime() - new Date(reminder.run_at).getTime() > 10 * 60_000;
  const event =
    `[event] Something you scheduled is due (reminder ${reminder.id}, for ${formatLocal(new Date(reminder.run_at), tz)}` +
    `${reminder.repeat ? `, repeats ${reminder.repeat}` : ""}${late ? ", and it's running late" : ""}).\n` +
    `Your note: ${reminder.note}\n` +
    `Check email, calendar, or the web first if the note calls for it. Then text the user, or reply SKIP if it's no longer worth texting.`;

  try {
    await textFirst(user, event);
  } catch (err) {
    console.error(`[scheduler] reminder ${reminder.id} failed:`, err);
    if (!reminder.repeat && reminder.attempts + 1 < MAX_ATTEMPTS) {
      rescheduleReminder(reminder.id, new Date(now.getTime() + RETRY_MINUTES * 60_000), reminder.attempts + 1);
    }
  }
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function runMorningBriefs(now: Date): Promise<void> {
  const users = db
    .prepare(
      `SELECT u.* FROM users u JOIN google_accounts g ON g.user_id = u.id
       WHERE u.status = 'active' AND u.brief_enabled = 1 AND u.conversation_id IS NOT NULL`,
    )
    .all() as unknown as User[];

  for (const user of users) {
    const clock = localClock(now, userTz(user));
    const sinceBrief = clock.minutes - parseHHMM(user.brief_time);
    if (user.last_brief_date === clock.date || sinceBrief < 0 || sinceBrief > BRIEF_WINDOW_MINUTES) continue;
    const { granted } = googleStatus(user);
    if (!granted.calendar && !granted.readMail) continue;

    // Mark first: one brief per day even if this one fails.
    db.prepare("UPDATE users SET last_brief_date = ? WHERE id = ?").run(clock.date, user.id);
    const sources = [granted.calendar && "today's calendar", granted.readMail && "anything in email that needs them today"]
      .filter(Boolean)
      .join(" and ");
    const event =
      `[event] Morning check. Look at ${sources}. ` +
      "If something's worth a heads-up, text one short good-morning message with just that (e.g. \"morning! dinner at lilia tonight at 8\"). " +
      "Don't list routine stuff or say their day looks empty. If nothing matters today, reply SKIP.";
    await textFirst(user, event).catch((err) => console.error(`[scheduler] brief for user ${user.id} failed:`, err));
  }
}

const UPGRADE_TEXT: Record<string, string> = {
  readMail: "check and clean up your inbox",
  sendMail: "send emails for you",
  calendar: "manage your calendar",
  contacts: "look up your contacts",
};

/**
 * After GOOGLE_ACCESS goes up a level, tells each connected user once that
 * reconnecting unlocks more. The link expires in 30 minutes; after that they
 * can just ask for a new one.
 */
async function nudgeUpgrades(): Promise<void> {
  // upgrade_nudged holds the level each user was last checked at.
  const level = ["testers", "basic", "full"].indexOf(config.googleAccess);
  if (level < 1) return;
  const users = db
    .prepare(
      `SELECT u.* FROM users u JOIN google_accounts g ON g.user_id = u.id
       WHERE u.status = 'active' AND u.conversation_id IS NOT NULL AND g.upgrade_nudged < ?`,
    )
    .all(level) as unknown as User[];
  for (const user of users) {
    const { upgrade } = googleStatus(user);
    db.prepare("UPDATE google_accounts SET upgrade_nudged = ? WHERE user_id = ?").run(level, user.id);
    if (!upgrade.length) continue;
    const what = upgrade.map((k) => UPGRADE_TEXT[k]).join(" and ");
    await notifyUser(user.id, `good news, i can now ${what}! tap to turn it on: ${createConnectLink(user.id)}`).catch(
      (err) => console.error(`[scheduler] upgrade nudge for user ${user.id} failed:`, err),
    );
  }
}

let running = false;

async function tick(): Promise<void> {
  if (running) return; // previous pass still going
  running = true;
  try {
    const now = new Date();
    for (const reminder of dueReminders(now)) await runReminder(reminder, now);
    await runMorningBriefs(now);
    await nudgeUpgrades();
  } catch (err) {
    console.error("[scheduler] tick failed:", err);
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  setInterval(() => void tick(), TICK_SECONDS * 1000);
  void tick();
  console.log(`[scheduler] checking reminders every ${TICK_SECONDS}s`);
}
