import { db } from "./db.js";

export interface Reminder {
  id: number;
  user_id: number;
  run_at: string;
  note: string;
  repeat: "daily" | "weekly" | null;
  status: "pending" | "done" | "cancelled";
  attempts: number;
}

export function createReminder(userId: number, runAt: Date, note: string, repeat: Reminder["repeat"]): number {
  return Number(
    db
      .prepare("INSERT INTO reminders (user_id, run_at, note, repeat) VALUES (?, ?, ?, ?)")
      .run(userId, runAt.toISOString(), note, repeat).lastInsertRowid,
  );
}

export function pendingReminders(userId: number): Reminder[] {
  return db
    .prepare("SELECT * FROM reminders WHERE user_id = ? AND status = 'pending' ORDER BY run_at")
    .all(userId) as unknown as Reminder[];
}

/** Returns false if there's no such pending reminder for this user. */
export function cancelReminder(userId: number, id: number): boolean {
  return (
    db
      .prepare("UPDATE reminders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'")
      .run(id, userId).changes === 1
  );
}

export function dueReminders(now: Date): Reminder[] {
  return db
    .prepare("SELECT * FROM reminders WHERE status = 'pending' AND run_at <= ? ORDER BY run_at LIMIT 50")
    .all(now.toISOString()) as unknown as Reminder[];
}

export function markReminderDone(id: number): void {
  db.prepare("UPDATE reminders SET status = 'done' WHERE id = ?").run(id);
}

/** Moves a reminder to a new time (next repeat, or a retry after a failure). */
export function rescheduleReminder(id: number, runAt: Date, attempts = 0): void {
  db.prepare("UPDATE reminders SET status = 'pending', run_at = ?, attempts = ? WHERE id = ?").run(
    runAt.toISOString(),
    attempts,
    id,
  );
}
