// Turns an OpenStreetMap `opening_hours` value into "Open · Closes 9:00 PM" and a weekly list.
// The parser is large, so it is loaded only when a place actually has hours.

export interface DayHours {
  day: string;
  text: string;
  isToday: boolean;
}

export interface HoursInfo {
  state: "open" | "closed" | "unknown";
  /** e.g. "Open · Closes 9:00 PM" */
  summary: string;
  week: DayHours[];
}

// Search covers India and Japan, so the place's own clock is known. Hours are
// judged on the place's clock, not the viewer's.
const TZ_BY_COUNTRY: Record<string, string> = { in: "Asia/Kolkata", jp: "Asia/Tokyo" };

/** A Date whose local fields show the wall-clock time in `timeZone`. */
function toPlaceClock(now: Date, timeZone?: string): Date {
  if (!timeZone) return now;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(now);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
}

const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const weekday = (d: Date, style: "short" | "long") =>
  d.toLocaleDateString("en-US", { weekday: style });
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "9:00 PM", or "Tue 9:00 AM" when it's not today. */
function whenLabel(d: Date, today: Date): string {
  return sameDay(d, today) ? time(d) : `${weekday(d, "short")} ${time(d)}`;
}

export async function describeHours(
  raw: string,
  place: { lat: number; lng: number; countryCode?: string },
  now: Date = new Date(),
): Promise<HoursInfo | null> {
  // The package's runtime export is the parser itself (default), whatever its typings say.
  const mod = (await import("opening_hours")) as unknown as {
    default?: typeof import("opening_hours").opening_hours;
  } & typeof import("opening_hours");
  const OpeningHours = mod.default ?? mod.opening_hours;

  let oh: InstanceType<typeof OpeningHours>;
  try {
    oh = new OpeningHours(raw, {
      lat: String(place.lat),
      lon: String(place.lng),
      address: { country_code: place.countryCode ?? "", state: "" },
    });
  } catch {
    return null; // unparseable value: caller shows the raw text
  }

  const tz = place.countryCode ? TZ_BY_COUNTRY[place.countryCode.toLowerCase()] : undefined;
  const at = toPlaceClock(now, tz);

  const unknown = oh.getUnknown(at);
  const isOpen = oh.getState(at);
  const next = oh.getNextChange(at);

  let state: HoursInfo["state"];
  let summary: string;
  if (unknown) {
    state = "unknown";
    summary = oh.getComment(at) ? `Hours vary · ${oh.getComment(at)}` : "Hours vary";
  } else if (isOpen) {
    state = "open";
    // No change within the search horizon means open round the clock.
    const alwaysOpen = !next || next.getTime() - at.getTime() > 8 * 24 * 3600 * 1000;
    summary = alwaysOpen ? "Open 24 hours" : `Open · Closes ${whenLabel(next!, at)}`;
  } else {
    state = "closed";
    summary = next ? `Closed · Opens ${whenLabel(next, at)}` : "Closed";
  }

  const week: DayHours[] = [];
  for (let i = 0; i < 7; i++) {
    const start = new Date(at.getFullYear(), at.getMonth(), at.getDate() + i);
    const end = new Date(at.getFullYear(), at.getMonth(), at.getDate() + i + 1);
    const intervals = oh.getOpenIntervals(start, end);
    let text: string;
    if (intervals.length === 0) text = "Closed";
    else if (intervals.length === 1 && intervals[0][0] <= start && intervals[0][1] >= end) text = "Open 24 hours";
    else
      text = intervals
        .map(([from, to]) => `${time(from < start ? start : from)} – ${time(to)}`)
        .join(", ");
    week.push({ day: weekday(start, "long"), text, isToday: i === 0 });
  }

  return { state, summary, week };
}
