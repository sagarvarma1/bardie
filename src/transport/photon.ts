import { Spectrum, text, type Message, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import type { InboundHandler, InboundMedia, InboundMessage, Transport } from "./types.js";

type SpectrumApp = Awaited<ReturnType<typeof createApp>>;

function createApp(projectId: string, projectSecret: string) {
  return Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config()],
    options: { flattenGroups: true },
    telemetry: false,
  });
}

/** Inbound messages kept around so the agent can tapback them a moment later. */
const RECENT_LIMIT = 200;

type Parsed = { texts: string[]; media: InboundMedia[]; reactionTo?: InboundMessage["reactionTo"] };

/** "Maya Patel, +15551234567, maya@x.com" from a shared contact card. */
function describeContact(c: Extract<Message["content"], { type: "contact" }>): string {
  const name = c.name?.formatted ?? [c.name?.first, c.name?.last].filter(Boolean).join(" ");
  const parts = [
    name,
    c.org?.name,
    ...(c.phones ?? []).map((p) => p.value),
    ...(c.emails ?? []).map((e) => e.value),
    ...(c.addresses ?? []).map((a) => [a.street, a.city, a.region, a.postalCode].filter(Boolean).join(", ")),
    c.birthday && `birthday ${c.birthday}`,
  ].filter(Boolean);
  return `[shared a contact card: ${parts.join(" | ") || "no details"}]`;
}

/** Turns any supported content (text, photos, PDFs, voice, contact cards, tapbacks) into text + media. */
async function parseContent(message: Message, out: Parsed): Promise<void> {
  const content = message.content;
  switch (content.type) {
    case "text":
      out.texts.push(content.text);
      return;
    case "group":
      for (const item of content.items) await parseContent(item, out);
      return;
    case "attachment": {
      const mime = content.mimeType.toLowerCase();
      if (mime.startsWith("image/") || mime === "application/pdf") {
        out.media.push({
          kind: mime === "application/pdf" ? "pdf" : "image",
          mimeType: mime,
          name: content.name,
          data: await content.read(),
        });
      } else {
        out.texts.push(`[sent a file you can't open: ${content.name}]`);
      }
      return;
    }
    case "voice":
      out.media.push({ kind: "voice", mimeType: content.mimeType, name: content.name, data: await content.read() });
      return;
    case "contact":
      out.texts.push(describeContact(content));
      return;
    case "reaction": {
      // Only tapbacks on our own texts mean anything to the conversation.
      const target = content.target;
      if (target?.direction !== "outbound") return;
      out.reactionTo = {
        emoji: content.emoji,
        text: target.content.type === "text" ? target.content.text : `[${target.content.type}]`,
      };
      return;
    }
    default:
      console.log(`[photon] ignoring ${content.type} content`);
  }
}

/**
 * iMessage via Photon Spectrum. Holds a persistent gRPC stream to Photon,
 * so no public URL or webhook is needed.
 *
 * Free tier caveat: a shared line can only message someone after they have
 * texted it first ("Target not allowed for this project").
 */
export class PhotonTransport implements Transport {
  readonly name = "photon";
  private app?: SpectrumApp;
  private stopped = false;
  // Spaces seen on inbound messages, so replies don't need a lookup.
  private spaces = new Map<string, Space>();
  private recent = new Map<string, Message>();

  constructor(
    private readonly projectId: string,
    private readonly projectSecret: string,
  ) {}

  async start(onMessage: InboundHandler): Promise<void> {
    this.app = await createApp(this.projectId, this.projectSecret);
    void this.consume(onMessage);
  }

  // The SDK reconnects within a session, but if the iterator itself throws or
  // ends we re-subscribe with capped exponential backoff so inbound never dies.
  private async consume(onMessage: InboundHandler): Promise<void> {
    let backoffMs = 1_000;
    while (!this.stopped) {
      try {
        for await (const [space, message] of this.app!.messages) {
          backoffMs = 1_000;
          if (message.direction !== "inbound") continue;

          const parsed: Parsed = { texts: [], media: [] };
          try {
            await parseContent(message, parsed);
          } catch (err) {
            console.error(`[photon] couldn't read ${message.content.type} message:`, err);
            parsed.texts.push(`[sent something that didn't come through: ${message.content.type}]`);
          }
          if (!parsed.texts.length && !parsed.media.length && !parsed.reactionTo) continue;

          this.spaces.set(space.id, space);
          this.remember(message);
          const isGroup = (space as { type?: string }).type === "group";
          await onMessage({
            id: message.id,
            transport: this.name,
            conversationId: space.id,
            senderId: message.sender?.id ?? "unknown",
            isGroup,
            text: parsed.texts.join("\n"),
            media: parsed.media.length ? parsed.media : undefined,
            reactionTo: parsed.reactionTo,
            timestamp: message.timestamp,
          });
          message.read().catch(() => {});
        }
        if (this.stopped) return;
        console.warn("[photon] inbound stream ended, re-subscribing");
      } catch (err) {
        if (this.stopped) return;
        console.error(`[photon] inbound stream error, retrying in ${backoffMs}ms:`, err);
      }
      await new Promise((r) => setTimeout(r, backoffMs + Math.random() * 500));
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }

  private remember(message: Message): void {
    this.recent.set(message.id, message);
    if (this.recent.size > RECENT_LIMIT) this.recent.delete(this.recent.keys().next().value!);
  }

  private async resolveSpace(conversationId: string): Promise<Space> {
    const cached = this.spaces.get(conversationId);
    if (cached) return cached;
    const im = imessage(this.app!);
    // A bare phone/email addresses a DM; anything else is an existing space id.
    const space = /^\+\d+$|@/.test(conversationId)
      ? await im.space.create(conversationId)
      : await im.space.get(conversationId);
    this.spaces.set(conversationId, space);
    return space;
  }

  async send(conversationId: string, body: string): Promise<void> {
    const space = await this.resolveSpace(conversationId);
    await space.send(text(body));
  }

  async react(conversationId: string, messageId: string, emoji: string): Promise<void> {
    const message = this.recent.get(messageId) ?? (await (await this.resolveSpace(conversationId)).getMessage?.(messageId));
    if (!message) throw new Error(`message ${messageId} not found`);
    await message.react(emoji);
  }

  async withTyping<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
    const space = await this.resolveSpace(conversationId);
    return this.app!.responding(space, fn);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.app?.stop();
  }
}
