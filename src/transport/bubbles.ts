import type { Transport } from "./types.js";

const MAX_BUBBLES = 3;

/** Splits a reply into iMessage bubbles at blank lines (at most three). */
export function splitBubbles(text: string): string[] {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= MAX_BUBBLES) return parts;
  return [...parts.slice(0, MAX_BUBBLES - 1), parts.slice(MAX_BUBBLES - 1).join("\n")];
}

/**
 * Sends a reply as separate bubbles, with a short typing pause before each
 * follow-up, the way a person sends a few texts in a row.
 */
export async function sendBubbles(transport: Transport, conversationId: string, text: string): Promise<void> {
  const bubbles = splitBubbles(text);
  for (const [i, bubble] of bubbles.entries()) {
    if (i > 0) {
      const pauseMs = Math.min(600 + bubble.length * 18, 2200);
      await transport.withTyping(conversationId, () => new Promise((r) => setTimeout(r, pauseMs)));
    }
    await transport.send(conversationId, bubble);
  }
}
