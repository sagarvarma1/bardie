import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createEvent, deleteEvent, type EventInput, listEvents, updateEvent } from "../../google/calendar.js";
import { userTz, zonedToUtc } from "../../time.js";
import { guard, type Turn } from "./common.js";

const localTime = z.string().describe("Local time in the user's timezone, YYYY-MM-DDTHH:MM (or YYYY-MM-DD when all_day)");

export function calendarTools({ user }: Turn) {
  const guarded = guard(user);
  const tz = userTz(user);

  /** Tool input (local wall-clock strings) -> calendar input. */
  const toEvent = (input: { title?: string; start?: string; end?: string; all_day?: boolean; location?: string; notes?: string }): EventInput => ({
    title: input.title,
    location: input.location,
    notes: input.notes,
    start: input.start === undefined ? undefined : input.all_day ? input.start.slice(0, 10) : zonedToUtc(input.start, tz),
    end: input.end === undefined ? undefined : input.all_day ? input.end.slice(0, 10) : zonedToUtc(input.end, tz),
  });

  return [
    betaZodTool({
      name: "list_events",
      description:
        "List events on the user's Google Calendar between two local times. Use for 'what's on my calendar', checking if they're free, or finding an event id to change.",
      inputSchema: z.object({
        start: localTime,
        end: localTime,
        query: z.string().optional().describe("Optional text to match, e.g. 'dentist'"),
      }),
      run: guarded(async ({ start, end, query }) => {
        const events = await listEvents(user.id, zonedToUtc(start, tz), zonedToUtc(end, tz), tz, query);
        return events.length ? JSON.stringify(events) : "No events in that range.";
      }),
    }),
    betaZodTool({
      name: "create_event",
      description:
        "Add an event to the user's own Google Calendar. No guests are invited. Default length is one hour. Tell the user what you added.",
      inputSchema: z.object({
        title: z.string(),
        start: localTime,
        end: localTime.optional(),
        all_day: z.boolean().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      }),
      run: guarded(async (input) => {
        const event = await createEvent(user.id, toEvent(input), tz);
        return `Added: ${JSON.stringify(event)}`;
      }),
    }),
    betaZodTool({
      name: "update_event",
      description: "Change an event on the user's calendar (id from list_events). Only pass the fields that change.",
      inputSchema: z.object({
        event_id: z.string(),
        title: z.string().optional(),
        start: localTime.optional(),
        end: localTime.optional(),
        all_day: z.boolean().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      }),
      run: guarded(async ({ event_id, ...input }) => {
        const event = await updateEvent(user.id, event_id, toEvent(input), tz);
        return `Updated: ${JSON.stringify(event)}`;
      }),
    }),
    betaZodTool({
      name: "delete_event",
      description: "Delete an event from the user's calendar. Only when the user asked for it to be removed.",
      inputSchema: z.object({ event_id: z.string() }),
      run: guarded(async ({ event_id }) => {
        await deleteEvent(user.id, event_id);
        return "Deleted.";
      }),
    }),
  ];
}
