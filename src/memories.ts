import { db } from "./db.js";

export interface Memory {
  id: number;
  content: string;
}

/** Shown to the agent on every turn, so keep the list bounded. */
const MAX_SHOWN = 100;

export function addMemory(userId: number, content: string): number {
  return Number(db.prepare("INSERT INTO memories (user_id, content) VALUES (?, ?)").run(userId, content).lastInsertRowid);
}

/** The newest memories, oldest first. */
export function listMemories(userId: number): Memory[] {
  return (
    db
      .prepare("SELECT id, content FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT ?")
      .all(userId, MAX_SHOWN) as unknown as Memory[]
  ).reverse();
}

export function deleteMemory(userId: number, id: number): boolean {
  return db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(id, userId).changes === 1;
}
