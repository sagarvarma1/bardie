import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phone           TEXT NOT NULL UNIQUE,          -- E.164, the user's own number
    assigned_number TEXT,                          -- the Photon pool number they text
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
    signup_code     TEXT,                          -- proves phone ownership on first text
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at    TEXT
  );

  -- One Google account per user. The refresh token is AES-GCM encrypted.
  CREATE TABLE IF NOT EXISTS google_accounts (
    user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email             TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    history_id        TEXT,                        -- Gmail history cursor for the inbox monitor
    connected_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Single-use links texted to users for connecting Google.
  CREATE TABLE IF NOT EXISTS connect_tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  -- Conversation history the agent sees.
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS messages_user ON messages (user_id, id);

  -- Drafts Bardie created. Sending requires a draft from an earlier turn,
  -- so the user has always seen it before it goes out.
  CREATE TABLE IF NOT EXISTS drafts (
    draft_id     TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_addr      TEXT NOT NULL,
    subject      TEXT NOT NULL,
    created_turn INTEGER NOT NULL,              -- messages.id of the user turn that created it
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent'))
  );

  -- Times Bardie texts first: reminders the user asked for and follow-ups
  -- Bardie scheduled itself. The note is read back to the agent when due.
  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_at     TEXT NOT NULL,                      -- UTC ISO 8601
    note       TEXT NOT NULL,
    repeat     TEXT CHECK (repeat IN ('daily', 'weekly')),
    status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS reminders_due ON reminders (status, run_at);

  -- Lasting facts Bardie keeps about the user (people, places, preferences),
  -- shown to the agent on every turn since chat history only goes back 30 texts.
  CREATE TABLE IF NOT EXISTS memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS memories_user ON memories (user_id, id);

  -- Numbers that tried to sign up while Bardie was full.
  CREATE TABLE IF NOT EXISTS waitlist (
    phone      TEXT PRIMARY KEY,
    timezone   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Columns added after the first release. ALTER fails if the column exists.
for (const ddl of [
  "ALTER TABLE users ADD COLUMN conversation_id TEXT",
  "ALTER TABLE users ADD COLUMN timezone TEXT",
  "ALTER TABLE users ADD COLUMN brief_enabled INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN brief_time TEXT NOT NULL DEFAULT '08:00'",
  "ALTER TABLE users ADD COLUMN last_brief_date TEXT",
  // Local date the user hit the daily text limit, so the notice goes out once.
  "ALTER TABLE users ADD COLUMN capped_date TEXT",
  // messages.id of the turn where the user asked to delete their account.
  "ALTER TABLE users ADD COLUMN delete_requested_turn INTEGER",
  // Space-separated scopes Google granted. NULL: connected before this was
  // tracked, when every connection had the original four scopes.
  "ALTER TABLE google_accounts ADD COLUMN scopes TEXT",
  // The GOOGLE_ACCESS level (0 testers, 1 basic, 2 full) at which the user was
  // last offered a reconnect for newly available permissions.
  "ALTER TABLE google_accounts ADD COLUMN upgrade_nudged INTEGER NOT NULL DEFAULT 0",
  // Drafts kept by Bardie itself, for users who can send but not draft in Gmail.
  "ALTER TABLE drafts ADD COLUMN body TEXT",
  "ALTER TABLE drafts ADD COLUMN cc TEXT",
  "ALTER TABLE drafts ADD COLUMN local INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(ddl);
  } catch {
    // already applied
  }
}
