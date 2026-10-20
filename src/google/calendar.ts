import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { formatLocal } from "../time.js";
import { googleClientFor } from "./oauth.js";

function api(userId: number): calendar_v3.Calendar {
  return calendar({ version: "v3", auth: googleClientFor(userId) });
}

export interface EventSummary {
  id: string;
  title: string;
  when: string;
  location?: string;
}

function summarize(ev: calendar_v3.Schema$Event, tz: string): EventSummary {
  let when: string;
  if (ev.start?.date) {
    // All-day: Google's end date is exclusive.
    const start = new Date(`${ev.start.date}T12:00:00Z`);
    const lastDay = ev.end?.date ? new Date(new Date(`${ev.end.date}T12:00:00Z`).getTime() - 86_400_000) : start;
    when =
      lastDay.getTime() > start.getTime()
        ? `${formatLocal(start, "UTC", { dateOnly: true })} to ${formatLocal(lastDay, "UTC", { dateOnly: true })} (all day)`
        : `${formatLocal(start, "UTC", { dateOnly: true })} (all day)`;
  } else {
    const start = new Date(ev.start?.dateTime ?? "");
    const end = new Date(ev.end?.dateTime ?? "");
    when = `${formatLocal(start, tz)} to ${end.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`;
  }
  return {
    id: ev.id ?? "",
    title: ev.summary || "(no title)",
    when,
    ...(ev.location ? { location: ev.location } : {}),
  };
}

/** Events on the primary calendar between two instants, earliest first. */
export async function listEvents(
  userId: number,
  start: Date,
  end: Date,
  tz: string,
  query?: string,
): Promise<EventSummary[]> {
  const res = await api(userId).events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
    q: query || undefined,
    timeZone: tz,
  });
  return (res.data.items ?? []).filter((ev) => ev.status !== "cancelled").map((ev) => summarize(ev, tz));
}

export interface EventInput {
  title?: string;
  /** Timed events: UTC instants. All-day events: dates as "YYYY-MM-DD" (end inclusive). */
  start?: Date | string;
  end?: Date | string;
  location?: string;
  notes?: string;
}

function eventBody(input: EventInput, tz: string): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {};
  if (input.title !== undefined) body.summary = input.title;
  if (input.location !== undefined) body.location = input.location;
  if (input.notes !== undefined) body.description = input.notes;
  if (typeof input.start === "string") {
    const lastDay = typeof input.end === "string" ? input.end : input.start;
    const after = new Date(`${lastDay}T12:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);
    body.start = { date: input.start };
    body.end = { date: after.toISOString().slice(0, 10) };
  } else if (input.start) {
    const end = input.end instanceof Date ? input.end : new Date(input.start.getTime() + 60 * 60 * 1000);
    body.start = { dateTime: input.start.toISOString(), timeZone: tz };
    body.end = { dateTime: end.toISOString(), timeZone: tz };
  }
  return body;
}

export async function createEvent(userId: number, input: EventInput, tz: string): Promise<EventSummary> {
  const res = await api(userId).events.insert({ calendarId: "primary", requestBody: eventBody(input, tz) });
  return summarize(res.data, tz);
}

export async function updateEvent(userId: number, eventId: string, input: EventInput, tz: string): Promise<EventSummary> {
  const res = await api(userId).events.patch({ calendarId: "primary", eventId, requestBody: eventBody(input, tz) });
  return summarize(res.data, tz);
}

export async function deleteEvent(userId: number, eventId: string): Promise<void> {
  await api(userId).events.delete({ calendarId: "primary", eventId });
}
