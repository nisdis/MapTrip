// Weekly streaks and monthly challenges. Pure rules (no imports): the server
// uses them for signed-in accounts (all devices), the app for trips on the
// phone when signed out.

/** What a trip needs for these rules. */
export interface TripFact {
  /** epoch ms (start) */
  createdAt: number;
  distanceM: number;
  kind?: string;
  imported?: boolean;
  /** photos and videos on it */
  media?: number;
  /** Explored map squares it passed through */
  cells?: string[];
}

/** Only real trips count: recorded in the app (not imported), at least 1 km. */
export const counts = (t: TripFact) => (t.kind ?? "recorded") === "recorded" && !t.imported && t.distanceM >= 1000;

// ---------------------------------------------------------------- local dates

/** "YYYY-MM-DD" in a time zone (IANA name; invalid or missing: UTC). */
export function localDate(ms: number, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
/** Weeks start on Monday: the number of the week a local date is in. */
const weekOf = (date: string) => Math.floor((dayNumber(date) + 3) / 7);

// ---------------------------------------------------------------- streaks

export interface Streak {
  /** weeks in a row with a trip, up to this week (still alive if only this week is missing so far) */
  current: number;
  best: number;
  /** a trip already counts for this week */
  thisWeek: boolean;
}

export function streakOf(trips: TripFact[], now: number, tz?: string | null): Streak {
  const weeks = new Set(trips.filter(counts).map((t) => weekOf(localDate(t.createdAt, tz))));
  const thisWeek = weekOf(localDate(now, tz));
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of [...weeks].sort((a, b) => a - b)) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  // Counting back from this week (or last week, if there's no trip yet this week).
  let current = 0;
  for (let w = weeks.has(thisWeek) ? thisWeek : thisWeek - 1; weeks.has(w); w--) current++;
  return { current, best, thisWeek: weeks.has(thisWeek) };
}

// ---------------------------------------------------------------- challenges

export interface ChallengeDef {
  id: string;
  title: string;
  /** how progress reads, e.g. "km" */
  unit: string;
  target: number;
  /** progress over the month's (counting) trips; earlier ones too, for "new" things */
  measure: (month: TripFact[], before: TripFact[], tz?: string | null) => number;
}

type Template = (level: number) => ChallengeDef;

/** The pool the rotation picks from; `level` (0-2) varies the targets month to month. */
const POOL: Template[] = [
  (l) => {
    const km = [100, 200, 300][l];
    return { id: `distance-${km}`, title: `Record ${km} km`, unit: "km", target: km, measure: (m) => Math.floor(m.reduce((s, t) => s + t.distanceM, 0) / 1000) };
  },
  (l) => {
    const n = [3, 4, 6][l];
    return {
      id: `days-${n}`,
      title: `Trips on ${n} different days`,
      unit: "days",
      target: n,
      measure: (m, _b, tz) => new Set(m.map((t) => localDate(t.createdAt, tz))).size,
    };
  },
  (l) => {
    const n = [30, 50, 100][l];
    return {
      id: `squares-${n}`,
      title: `Uncover ${n} new squares`,
      unit: "squares",
      target: n,
      measure: (m, b) => {
        const seen = new Set(b.flatMap((t) => t.cells ?? []));
        const fresh = new Set<string>();
        for (const t of m) for (const c of t.cells ?? []) if (!seen.has(c)) fresh.add(c);
        return fresh.size;
      },
    };
  },
  (l) => {
    const km = [25, 50, 100][l];
    return { id: `long-${km}`, title: `One trip of ${km} km or more`, unit: "km", target: km, measure: (m) => Math.floor(Math.max(0, ...m.map((t) => t.distanceM)) / 1000) };
  },
  (l) => {
    const n = [3, 5, 8][l];
    return { id: `photos-${n}`, title: `A trip with ${n} photos or videos`, unit: "photos", target: n, measure: (m) => Math.max(0, ...m.map((t) => t.media ?? 0)) };
  },
];

/** "YYYY-MM" of a local date. */
export const monthOf = (ms: number, tz?: string | null) => localDate(ms, tz).slice(0, 7);

/** The month's 3 challenges: the same for everyone, rotating through the pool. */
export function challengesFor(month: string): ChallengeDef[] {
  const [y, m] = month.split("-").map(Number);
  const n = y * 12 + (m - 1);
  const picks = [n % POOL.length, (n + 2) % POOL.length, (n + 4) % POOL.length];
  return picks.map((i, k) => POOL[i]((n + k) % 3));
}

export interface ChallengeProgress {
  id: string;
  title: string;
  unit: string;
  target: number;
  progress: number;
  done: boolean;
}

/** Progress on a month's challenges. */
export function progressFor(trips: TripFact[], month: string, tz?: string | null): ChallengeProgress[] {
  const real = trips.filter(counts);
  const inMonth = real.filter((t) => monthOf(t.createdAt, tz) === month);
  const before = real.filter((t) => monthOf(t.createdAt, tz) < month);
  return challengesFor(month).map((c) => {
    const progress = c.measure(inMonth, before, tz);
    return { id: c.id, title: c.title, unit: c.unit, target: c.target, progress: Math.min(progress, c.target), done: progress >= c.target };
  });
}

/** Challenges completed in earlier months (badges), newest first. */
export function badgesFor(trips: TripFact[], now: number, tz?: string | null): { month: string; id: string; title: string }[] {
  const real = trips.filter(counts);
  const thisMonth = monthOf(now, tz);
  const months = [...new Set(real.map((t) => monthOf(t.createdAt, tz)))].filter((m) => m < thisMonth).sort().reverse();
  return months.flatMap((m) => progressFor(trips, m, tz).filter((p) => p.done).map((p) => ({ month: m, id: p.id, title: p.title })));
}
