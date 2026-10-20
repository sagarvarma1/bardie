import { config } from "./config.js";
import { db } from "./db.js";
import { isValidTimeZone } from "./time.js";
import { registerUser } from "./transport/photon-users.js";

export interface User {
  id: number;
  phone: string;
  assigned_number: string | null;
  status: "pending" | "active";
  created_at: string;
  activated_at: string | null;
  conversation_id: string | null;
  timezone: string | null;
  brief_enabled: number;
  brief_time: string;
  last_brief_date: string | null;
  capped_date: string | null;
}

export class SignupError extends Error {}

/** Thrown when Bardie is full; the number was added to the waitlist. */
export class WaitlistedError extends Error {}

function addToWaitlist(phone: string, timezone: string | null): void {
  db.prepare("INSERT INTO waitlist (phone, timezone) VALUES (?, ?) ON CONFLICT(phone) DO NOTHING").run(phone, timezone);
}

/** The text pre-filled in iMessage after signup. Any first text activates the account. */
export const SIGNUP_TEXT = `Hey ${config.appName}! 👋`;

/** Accepts "(555) 123-4567", "555-123-4567", "+44 20 ..." etc. US numbers default to +1. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function findUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function findUserByPhone(phone: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as User | undefined;
}

/** Open early-access spots, for the landing page. */
export function spotsLeft(): number {
  return Math.max(0, config.maxUsers - countUsers());
}

function countUsers(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

/**
 * Starts signup for a phone number: registers it with Photon so it gets a
 * pool line. The account activates when the first text arrives from that
 * number, which proves the person owns it. Safe to call again for the same
 * number (returns the existing user).
 */
export async function startSignup(rawPhone: string, timezone?: string): Promise<User> {
  const phone = normalizePhone(rawPhone);
  // From the signup page's browser, i.e. the phone's own timezone setting.
  const tz = timezone && isValidTimeZone(timezone) ? timezone : null;
  if (!phone) throw new SignupError("That doesn't look like a valid phone number.");

  const existing = findUserByPhone(phone);
  if (existing?.status === "active" && existing.assigned_number) {
    if (tz && !existing.timezone) setTimezone(existing.id, tz);
    return findUserByPhone(phone)!;
  }
  if (!existing && countUsers() >= config.maxUsers) {
    addToWaitlist(phone, tz);
    throw new WaitlistedError();
  }

  let assignedNumber = existing?.assigned_number ?? null;
  if (config.transport === "photon") {
    const { user } = await registerUser(config.photon.projectId, config.photon.projectSecret, phone);
    assignedNumber = user.assignedPhoneNumber ?? assignedNumber;
  } else {
    assignedNumber = "+15550000000"; // console mode: no real line
  }

  db.prepare(
    `INSERT INTO users (phone, assigned_number, timezone) VALUES (?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET assigned_number = excluded.assigned_number,
       timezone = COALESCE(excluded.timezone, users.timezone)`,
  ).run(phone, assignedNumber, tz);
  return findUserByPhone(phone)!;
}

/** Signs up a number on its first text (open signups). Returns undefined when full. */
export function createActiveUser(phone: string): User | undefined {
  if (countUsers() >= config.maxUsers) {
    addToWaitlist(phone, null);
    return undefined;
  }
  db.prepare(
    "INSERT INTO users (phone, assigned_number, status, activated_at) VALUES (?, ?, 'active', datetime('now'))",
  ).run(phone, config.bardieNumber || null);
  return findUserByPhone(phone);
}

/** Activates a pending user. Returns true if this call activated them. */
export function activateUser(userId: number): boolean {
  const result = db
    .prepare("UPDATE users SET status = 'active', activated_at = datetime('now') WHERE id = ? AND status = 'pending'")
    .run(userId);
  return result.changes === 1;
}

/** Remembers where to reach a user for proactive texts (inbox alerts, reminders). */
export function setConversationId(userId: number, conversationId: string): void {
  db.prepare("UPDATE users SET conversation_id = ? WHERE id = ?").run(conversationId, userId);
}

export function setTimezone(userId: number, timezone: string): void {
  db.prepare("UPDATE users SET timezone = ? WHERE id = ?").run(timezone, userId);
}

/** Morning brief on/off and its local time ("HH:MM"). */
export function setMorningBrief(userId: number, enabled: boolean, time?: string): void {
  db.prepare("UPDATE users SET brief_enabled = ?, brief_time = COALESCE(?, brief_time) WHERE id = ?").run(
    enabled ? 1 : 0,
    time ?? null,
    userId,
  );
}

/** Deletes a user and everything attached (Google connection, history, drafts). */
export function deleteUser(phone: string): boolean {
  return db.prepare("DELETE FROM users WHERE phone = ?").run(phone).changes === 1;
}
