import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { reactToMessage } from "../../notifier.js";
import { guard, type Turn } from "./common.js";

const TAPBACKS = { love: "❤️", like: "👍", laugh: "😂", emphasize: "‼️", question: "❓", dislike: "👎" } as const;

/** Only on turns answering a message the user sent. */
export function reactTools(turn: Turn) {
  const { user, inbound } = turn;
  if (!inbound) return [];
  const guarded = guard(user);
  return [
    betaZodTool({
      name: "react",
      description:
        "Tapback the user's latest text (❤️ 👍 😂 ‼️ ❓ 👎). On its own it can be the whole reply when words would add nothing (\"thanks!\", \"ok cool\", \"lol\"); then write no text.",
      inputSchema: z.object({ tapback: z.enum(["love", "like", "laugh", "emphasize", "question", "dislike"]) }),
      run: guarded(async ({ tapback }) => {
        const emoji = TAPBACKS[tapback];
        await reactToMessage(inbound.conversationId, inbound.messageId, emoji);
        turn.reactions.push(emoji);
        return `Reacted ${emoji}.`;
      }),
    }),
  ];
}
