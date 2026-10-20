import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";
import { decrypt, encrypt } from "../crypto.js";
import { db } from "../db.js";
import { normalizePhone } from "../users.js";

const SCOPE = {
  // Read, label, draft, and send mail. Restricted scope: needs Google's full
  // review plus a security assessment before it can go beyond test users.
  gmailModify: "https://www.googleapis.com/auth/gmail.modify",
  // Send mail only (no reading). Sensitive scope: the lighter review.
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  // Read and edit events on the user's calendars (not calendar settings or sharing).
  calendar: "https://www.googleapis.com/auth/calendar.events",
  // Look up people's emails: saved contacts, and "other contacts" (people they've emailed).
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
  otherContacts: "https://www.googleapis.com/auth/contacts.other.readonly",
};

/** What every connection had before granted scopes were tracked. */
const LEGACY_SCOPES = [SCOPE.gmailModify, SCOPE.calendar, SCOPE.contacts, SCOPE.otherContacts];

/** The scopes the connect link asks for at the current access level. */
function requestedScopes(): string[] {
  const scopes = [SCOPE.gmailSend, SCOPE.calendar, SCOPE.contacts, SCOPE.otherContacts];
  return config.googleAccess === "basic" ? scopes : [...scopes, SCOPE.gmailModify];
}

/** What Bardie can do in someone's Google account, given a set of scopes. */
export interface GoogleCaps {
  readMail: boolean;
  sendMail: boolean;
  calendar: boolean;
  contacts: boolean;
}

function capsOf(scopes: string[]): GoogleCaps {
  const has = (s: string) => scopes.includes(s);
  return {
    readMail: has(SCOPE.gmailModify),
    sendMail: has(SCOPE.gmailModify) || has(SCOPE.gmailSend),
    calendar: has(SCOPE.calendar),
    contacts: has(SCOPE.contacts),
  };
}

/** Whether this user may connect Google at the current access level. */
export function canConnectGoogle(user: { phone: string }): boolean {
  if (!googleConfigured()) return false;
  if (config.googleAccess !== "testers") return true;
  // Local console testing stands in for the developer's own phone.
  if (config.transport === "console") return true;
  return config.googleTesterPhones.some((p) => normalizePhone(p) === user.phone);
}

/**
 * The user's Google situation: what they granted, and what they'd get by
 * connecting (or reconnecting) now. `available` is what tools should offer;
 * using one they haven't granted yet returns a reconnect link.
 */
export function googleStatus(user: { id: number; phone: string }): {
  account?: GoogleAccount;
  canConnect: boolean;
  granted: GoogleCaps;
  available: GoogleCaps;
  /** Things a reconnect would add. */
  upgrade: (keyof GoogleCaps)[];
} {
  const account = getGoogleAccount(user.id);
  const canConnect = canConnectGoogle(user);
  const grantedScopes = account ? (account.scopes?.split(" ") ?? LEGACY_SCOPES) : [];
  const granted = capsOf(grantedScopes);
  const offered = capsOf(canConnect ? requestedScopes() : []);
  const keys = Object.keys(granted) as (keyof GoogleCaps)[];
  const available = Object.fromEntries(keys.map((k) => [k, granted[k] || offered[k]])) as unknown as GoogleCaps;
  const upgrade = account ? keys.filter((k) => offered[k] && !granted[k]) : [];
  return { account, canConnect, granted, available, upgrade };
}

export const REDIRECT_PATH = "/oauth/google/callback";

export class GoogleNotConnectedError extends Error {}

function newClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    redirectUri: `${config.publicUrl}${REDIRECT_PATH}`,
  });
}

export function googleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

/** A single-use link (valid 30 minutes) that starts the Google sign-in for this user. */
export function createConnectLink(userId: number): string {
  const token = randomBytes(24).toString("base64url");
  db.prepare("DELETE FROM connect_tokens WHERE expires_at < datetime('now')").run();
  db.prepare("INSERT INTO connect_tokens (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 minutes'))").run(
    token,
    userId,
  );
  return `${config.publicUrl}/connect/${token}`;
}

/** Returns the user id for a live connect token, without consuming it. */
export function lookupConnectToken(token: string): number | undefined {
  const row = db
    .prepare("SELECT user_id FROM connect_tokens WHERE token = ? AND expires_at > datetime('now')")
    .get(token) as { user_id: number } | undefined;
  return row?.user_id;
}

export function googleAuthUrl(token: string): string {
  return newClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    // openid + email: the account's address without needing a Gmail scope.
    scope: ["openid", "email", ...requestedScopes()],
    state: token,
  });
}

/** Exchanges the OAuth code, stores the encrypted refresh token, and consumes the connect token. */
export async function completeGoogleConnect(token: string, code: string): Promise<{ userId: number; email: string }> {
  const userId = lookupConnectToken(token);
  if (!userId) throw new Error("This link has expired. Text Bardie to get a new one.");

  const client = newClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token. Please try again.");
  client.setCredentials(tokens);

  const ticket = await client.verifyIdToken({ idToken: tokens.id_token ?? "", audience: config.google.clientId });
  const email = ticket.getPayload()?.email ?? "your Google account";
  // Only the scopes the user actually ticked on the consent screen.
  const scopes = (tokens.scope ?? "").split(" ").filter((s) => s.startsWith("https://"));

  // The inbox monitor starts from "now"; that needs read access.
  let historyId: string | null = null;
  if (scopes.includes(SCOPE.gmailModify)) {
    const { gmail } = await import("@googleapis/gmail");
    const profile = await gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" });
    historyId = profile.data.historyId ?? null;
  }

  db.prepare(
    `INSERT INTO google_accounts (user_id, email, refresh_token_enc, history_id, scopes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, refresh_token_enc = excluded.refresh_token_enc,
       history_id = excluded.history_id, scopes = excluded.scopes, upgrade_nudged = 0, connected_at = datetime('now')`,
  ).run(userId, email, encrypt(tokens.refresh_token), historyId, scopes.join(" "));
  db.prepare("DELETE FROM connect_tokens WHERE token = ?").run(token);
  return { userId, email };
}

export interface GoogleAccount {
  user_id: number;
  email: string;
  refresh_token_enc: string;
  history_id: string | null;
  scopes: string | null;
  upgrade_nudged: number;
}

export function getGoogleAccount(userId: number): GoogleAccount | undefined {
  return db.prepare("SELECT * FROM google_accounts WHERE user_id = ?").get(userId) as GoogleAccount | undefined;
}

/** An authorized client for this user, or throws GoogleNotConnectedError. */
export function googleClientFor(userId: number): OAuth2Client {
  const account = getGoogleAccount(userId);
  if (!account) throw new GoogleNotConnectedError();
  const client = newClient();
  client.setCredentials({ refresh_token: decrypt(account.refresh_token_enc) });
  return client;
}

/** True when Google rejected the refresh token (revoked, or 7-day expiry in Testing mode). */
export function isRevokedGrant(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}

/** True when the user connected before a scope was added (e.g. Calendar, Contacts) and must reconnect. */
export function isInsufficientScope(err: unknown): boolean {
  const e = err as { status?: number; code?: number | string; message?: string };
  return (e?.status === 403 || e?.code === 403) && /insufficient.*scope/i.test(e?.message ?? "");
}

/** Revokes Bardie's access at Google (best effort) and forgets the account. */
export async function revokeGoogle(userId: number): Promise<void> {
  const account = getGoogleAccount(userId);
  if (!account) return;
  try {
    await newClient().revokeToken(decrypt(account.refresh_token_enc));
  } catch (err) {
    console.error(`[google] revoking user ${userId}'s token failed:`, err);
  }
  disconnectGoogle(userId);
}

export function disconnectGoogle(userId: number): void {
  db.prepare("DELETE FROM google_accounts WHERE user_id = ?").run(userId);
}
