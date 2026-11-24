// Achievements: milestones worked out from a person's trips each time (nothing
// stored, so they can't drift from the trips). Only trips recorded in the app
// count: imported GPX files could be anyone's.

import { haversineM } from "./live.js";
import { decodeTrack } from "./trackFormat.js";

export interface TripFacts {
  distanceM: number;
  /** epoch ms */
  createdAt: number;
  start: [number, number] | null;
  imported: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  /** 0..1 towards it */
  progress: number;
}

const KM = 1000;
/** Trip starts further apart than this count as different places. */
const PLACE_KM = 25;

/** ISO week number of a date, as "year-week" (weeks start on Monday). */
function isoWeek(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-${String(week).padStart(2, "0")}`;
}

function longestWeekRun(weeks: string[]): number {
  const set = new Set(weeks);
  let best = 0;
  for (const w of set) {
    // walk forward week by week from each week that starts a run
    let run = 0;
    let cursor = weekStart(w);
    while (set.has(isoWeek(cursor))) {
      run++;
      cursor += 7 * 86400000;
    }
    best = Math.max(best, run);
  }
  return best;
}

/** Monday 12:00 UTC of a "year-week". */
function weekStart(w: string): number {
  const [y, n] = w.split("-").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4, 12));
  const mondayWeek1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000;
  return mondayWeek1 + (n - 1) * 7 * 86400000;
}

/** Number of distinct places among trip starts (greedy clustering at PLACE_KM). */
function distinctPlaces(starts: [number, number][]): number {
  const centres: [number, number][] = [];
  for (const s of starts) {
    if (!centres.some((c) => haversineM(c, s) < PLACE_KM * KM)) centres.push(s);
  }
  return centres.length;
}

export function achievementsFor(all: TripFacts[]): Achievement[] {
  const trips = all.filter((t) => !t.imported && Number.isFinite(t.distanceM) && t.distanceM > 0);
  const totalKm = trips.reduce((s, t) => s + t.distanceM, 0) / KM;
  const byDay = new Map<string, number>();
  for (const t of trips) {
    const day = new Date(t.createdAt).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + t.distanceM / KM);
  }
  const bestDayKm = Math.max(0, ...byDay.values());
  const places = distinctPlaces(trips.map((t) => t.start).filter((s): s is [number, number] => !!s));
  const weekRun = longestWeekRun(trips.map((t) => isoWeek(t.createdAt)));

  const make = (id: string, title: string, description: string, value: number, target: number): Achievement => ({
    id,
    title,
    description,
    earned: value >= target,
    progress: Math.min(1, value / target),
  });
  return [
    make("first-trip", "First trip", "Record your first trip", trips.length, 1),
    make("trips-10", "Regular", "Record 10 trips", trips.length, 10),
    make("trips-50", "Seasoned", "Record 50 trips", trips.length, 50),
    make("km-10", "10 km", "Travel 10 km in total", totalKm, 10),
    make("km-100", "100 km", "Travel 100 km in total", totalKm, 100),
    make("km-1000", "1,000 km", "Travel 1,000 km in total", totalKm, 1000),
    make("day-50", "Big day", "Travel 50 km in one day", bestDayKm, 50),
    make("places-5", "Explorer", "Start trips in 5 different places (25 km apart)", places, 5),
    make("weekly-4", "Every week", "Record a trip every week for 4 weeks in a row", weekRun, 4),
  ];
}

/** The facts needed above, from a stored trip. */
export function factsOf(data: Record<string, unknown>): TripFacts {
  const first = decodeTrack(data.track)[0];
  return {
    distanceM: typeof data.distanceM === "number" ? data.distanceM : 0,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    start: first ? [first.lat, first.lng] : null,
    imported: data.imported === true,
  };
}
