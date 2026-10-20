import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { addMemory, deleteMemory } from "../../memories.js";
import { guard, type Turn } from "./common.js";

export function memoryTools({ user }: Turn) {
  const guarded = guard(user);
  return [
    betaZodTool({
      name: "remember",
      description:
        "Save a lasting fact about the user so you know it in future conversations: people and how they relate to the user (with emails/phones), addresses, preferences, routines, important dates. One fact per call, written so it makes sense on its own later.",
      inputSchema: z.object({ fact: z.string().describe("e.g. 'Landlord is Mark Chen, mark@chenproperties.com'") }),
      run: guarded(async ({ fact }) => `Saved (memory ${addMemory(user.id, fact)}).`),
    }),
    betaZodTool({
      name: "update_memory",
      description: "Replace a saved fact that changed (e.g. they moved, a new number). Ids are in the memory list in context.",
      inputSchema: z.object({ memory_id: z.number().int(), fact: z.string() }),
      run: guarded(async ({ memory_id, fact }) => {
        if (!deleteMemory(user.id, memory_id)) return "No memory with that id.";
        return `Updated (memory ${addMemory(user.id, fact)}).`;
      }),
    }),
    betaZodTool({
      name: "forget",
      description: "Delete a saved fact, when it's wrong or the user asks you to forget it.",
      inputSchema: z.object({ memory_id: z.number().int() }),
      run: guarded(async ({ memory_id }) => (deleteMemory(user.id, memory_id) ? "Forgotten." : "No memory with that id.")),
    }),
  ];
}
