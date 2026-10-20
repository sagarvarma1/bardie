import { db } from "./db.js";

// Lets background jobs (inbox monitor, Google connect callback) text a user
// without depending on a specific transport.

type SendFn = (conversationId: string, text: string) => Promise<void>;
let sendFn: SendFn | undefined;

export function setNotifier(fn: SendFn): void {
  sendFn = fn;
}

type ReactFn = (conversationId: string, messageId: string, emoji: string) => Promise<void>;
let reactFn: ReactFn | undefined;

export function setReactor(fn: ReactFn): void {
  reactFn = fn;
}

/** Tapbacks one of the user's messages. */
export async function reactToMessage(conversationId: string, messageId: string, emoji: string): Promise<void> {
  if (!reactFn) throw new Error("No transport connected");
  await reactFn(conversationId, messageId, emoji);
}

/**
 * Texts a user. Records it in their conversation history unless `record` is
 * false (e.g. the agent already stored it). Returns false if not reachable.
 */
export async function notifyUser(
  userId: number,
  text: string,
  historyNote?: string,
  record = true,
): Promise<boolean> {
  const row = db.prepare("SELECT conversation_id FROM users WHERE id = ?").get(userId) as
    | { conversation_id: string | null }
    | undefined;
  if (!sendFn || !row?.conversation_id || !text) return false;
  await sendFn(row.conversation_id, text);
  if (!record) return true;
  db.prepare("INSERT INTO messages (user_id, role, content) VALUES (?, 'assistant', ?)").run(
    userId,
    historyNote ? `${text}\n${historyNote}` : text,
  );
  return true;
}
