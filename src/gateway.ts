import { sendBubbles } from "./transport/bubbles.js";
import type { InboundMessage, Transport } from "./transport/types.js";

/** Produces the reply text for a message, or null to stay silent. */
export type Responder = (msg: InboundMessage) => Promise<string | null>;

/**
 * Sits between transports and the bot logic: drops duplicates and group
 * messages, then routes replies back out the transport the message came in on.
 */
export class Gateway {
  private seen = new Set<string>();

  constructor(private readonly respond: Responder) {}

  async attach(transport: Transport): Promise<void> {
    await transport.start((msg) => this.handle(transport, msg));
    console.log(`[gateway] ${transport.name} transport connected`);
  }

  private async handle(transport: Transport, msg: InboundMessage): Promise<void> {
    const key = `${msg.transport}:${msg.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 10_000) this.seen.clear();
    if (msg.isGroup) return;

    const extras = [
      ...(msg.media ?? []).map((m) => `[${m.kind}]`),
      msg.reactionTo ? `[tapback ${msg.reactionTo.emoji}]` : "",
    ].join(" ");
    console.log(`[gateway] <- ${msg.senderId}: ${[msg.text, extras].filter((s) => s.trim()).join(" ")}`);
    try {
      const reply = await transport.withTyping(msg.conversationId, () => this.respond(msg));
      if (reply) {
        await sendBubbles(transport, msg.conversationId, reply);
        console.log(`[gateway] -> ${msg.senderId}: ${reply}`);
      }
    } catch (err) {
      console.error(`[gateway] failed to handle message ${key}:`, err);
    }
  }
}
