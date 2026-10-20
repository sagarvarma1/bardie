import {
  createConnectLink,
  disconnectGoogle,
  GoogleNotConnectedError,
  googleConfigured,
  isInsufficientScope,
  isRevokedGrant,
} from "../../google/oauth.js";
import type { User } from "../../users.js";

/** What every tool knows about the turn it runs in. */
export type Turn = {
  user: User;
  turnId: number;
  /** The message being answered, when the user sent one (not on reminders or the morning brief). */
  inbound?: { conversationId: string; messageId: string };
  /** Tapbacks sent this turn, so a reaction alone can be the whole reply. */
  reactions: string[];
  /** Set when the user deleted their account this turn: nothing more is stored. */
  accountDeleted?: boolean;
};

function toolError(err: unknown, user: User): string {
  if (err instanceof GoogleNotConnectedError) {
    return googleConfigured()
      ? `Google isn't connected. Send the user this link to connect it: ${createConnectLink(user.id)}`
      : "Google isn't available yet (the server has no Google credentials configured). Tell the user it's coming soon.";
  }
  if (isRevokedGrant(err)) {
    disconnectGoogle(user.id);
    return `Google access expired. Send the user this link to reconnect: ${createConnectLink(user.id)}`;
  }
  if (isInsufficientScope(err)) {
    return `The user connected Google before Bardie got this permission, so they need to reconnect once (one tap). Send them this link: ${createConnectLink(user.id)}`;
  }
  console.error("[agent] tool error:", err);
  return `Error: ${(err as Error)?.message ?? "something went wrong"}`;
}

/** Wraps a tool so failures come back to the model as text it can act on. */
export function guard(user: User) {
  return <T>(fn: (input: T) => Promise<string>) =>
    async (input: T) => {
      try {
        return await fn(input);
      } catch (err) {
        return toolError(err, user);
      }
    };
}
