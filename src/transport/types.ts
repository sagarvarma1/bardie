// Every messaging channel (Photon iMessage, console, later Linq/Telegram/...)
// implements this interface. The rest of the app never imports a provider SDK
// directly, so swapping or adding channels is a one-file change.

/** A photo, PDF, or voice memo that came with a message. */
export interface InboundMedia {
  kind: "image" | "pdf" | "voice";
  mimeType: string;
  name?: string;
  data: Buffer;
}

export interface InboundMessage {
  /** Provider-scoped message id, used for dedupe. */
  id: string;
  /** Which transport delivered it, e.g. "photon" or "console". */
  transport: string;
  /** Opaque conversation id to reply into. */
  conversationId: string;
  /** Sender handle: E.164 phone number or email. */
  senderId: string;
  isGroup: boolean;
  /** Typed text, or a description of non-text content (e.g. a shared contact card). May be empty when only media came in. */
  text: string;
  media?: InboundMedia[];
  /** Set when the user tapped back on one of our messages. */
  reactionTo?: { emoji: string; text: string };
  timestamp: Date;
}

export type InboundHandler = (msg: InboundMessage) => Promise<void>;

export interface Transport {
  readonly name: string;
  /** Connects and starts delivering inbound messages to `onMessage`. */
  start(onMessage: InboundHandler): Promise<void>;
  /** Sends a text reply into an existing conversation. */
  send(conversationId: string, text: string): Promise<void>;
  /** Tapbacks an inbound message (emoji like "❤️"), where the channel supports it. */
  react(conversationId: string, messageId: string, emoji: string): Promise<void>;
  /** Shows a typing indicator while `fn` runs, where the channel supports it. */
  withTyping<T>(conversationId: string, fn: () => Promise<T>): Promise<T>;
  stop(): Promise<void>;
}
