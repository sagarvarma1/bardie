import readline from "node:readline";
import { randomUUID } from "node:crypto";
import type { InboundHandler, Transport } from "./types.js";

/**
 * Local development transport: type messages in the terminal, replies print
 * back. Lets you build the bot without spending Photon's free quota.
 */
export class ConsoleTransport implements Transport {
  readonly name = "console";
  private rl?: readline.Interface;

  constructor(private readonly senderId: string) {}

  async start(onMessage: InboundHandler): Promise<void> {
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    this.rl.setPrompt("you> ");
    this.rl.prompt();
    this.rl.on("line", async (line) => {
      const body = line.trim();
      if (body) {
        await onMessage({
          id: randomUUID(),
          transport: this.name,
          conversationId: "console",
          senderId: this.senderId,
          isGroup: false,
          text: body,
          timestamp: new Date(),
        });
      }
      this.rl?.prompt();
    });
  }

  async send(_conversationId: string, body: string): Promise<void> {
    console.log(`bot> ${body}`);
  }

  async react(_conversationId: string, _messageId: string, emoji: string): Promise<void> {
    console.log(`bot> [reacted ${emoji}]`);
  }

  async withTyping<T>(_conversationId: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async stop(): Promise<void> {
    this.rl?.close();
  }
}
