import { config } from "./config.js";

// Timezone math with plain Intl, no date library. Users' wall-clock times
// ("friday 3pm") are stored as UTC instants; these helpers convert both ways.

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function userTz(user: { timezone: string | null }): string {
  return user.timezone ?? config.defaultTimezone;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(date: Date, tz: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** How far `tz` is ahead of UTC at `date`, in ms. */
function offsetMs(date: Date, tz: string): number {
  const p = localParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * "2026-10-20T15:00" in `tz` -> the UTC instant. Strings that already carry
 * an offset or Z are taken as-is. Throws on anything unparseable.
 */
export function zonedToUtc(local: string, tz: string): Date {
  const s = local.trim();
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`Can't read the time "${local}"`);
    return d;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) throw new Error(`Can't read the time "${local}". Use YYYY-MM-DDTHH:MM.`);
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  // Two passes so times next to a DST change land on the right offset.
  let utc = asUtc - offsetMs(new Date(asUtc), tz);
  utc = asUtc - offsetMs(new Date(utc), tz);
  return new Date(utc);
}

/** The same wall-clock time `days` later in `tz` (stays at 9am across DST). */
export function addLocalDays(date: Date, days: number, tz: string): Date {
  const p = localParts(date, tz);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return zonedToUtc(
    `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(p.hour)}:${pad(p.minute)}`,
    tz,
  );
}

/** Today's date ("2026-10-20") and minutes since midnight in `tz`. */
export function localClock(date: Date, tz: string): { date: string; minutes: number } {
  const p = localParts(date, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, minutes: p.hour * 60 + p.minute };
}

/** "Tue, Oct 20, 3:00 PM" in the user's timezone. */
export function formatLocal(date: Date, tz: string, opts: { dateOnly?: boolean } = {}): string {
  return date.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(opts.dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}

/** The context line the agent sees on every turn. */
export function nowLine(user: { timezone: string | null }): string {
  const tz = userTz(user);
  const now = new Date().toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const known = user.timezone
    ? `timezone ${tz}`
    : `timezone unknown, assuming ${tz}; ask where they are before scheduling anything time-sensitive, then call set_timezone`;
  return `[Current time for the user: ${now} (${known})]`;
}
