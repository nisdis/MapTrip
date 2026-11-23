// Client for /api/public: sharing finished trips, Explore, reports.

export type Visibility = "private" | "unlisted" | "public";
export const HIDE_OPTIONS = [0, 300, 500, 1000] as const;
export type HideM = (typeof HIDE_OPTIONS)[number];

export interface ShareSettings {
  visibility: Visibility;
  hideM: number;
  photos: string[];
  hiddenFromExplore?: boolean;
  views?: number;
  /** after saving: points left once the ends are hidden */
  visiblePoints?: number;
}

export interface PublicStats {
  distanceM: number;
  durationS: number;
  maxSpeedMs: number;
  /** yyyy-mm-dd */
  date: string;
}

export interface PublicTrip {
  id: string;
  title: string;
  author: string | null;
  visibility: Visibility;
  /** from a GPX file, not recorded live in the app */
  imported?: boolean;
  hideM: number;
  stats: PublicStats;
  /** [lat, lng, t, speed, gap] */
  points: [number, number, number, number | null, 0 | 1][];
  photos: string[];
  views: number;
}

export interface ExploreTrip {
  id: string;
  title: string;
  author: string | null;
  stats: PublicStats;
  views: number;
  imported?: boolean;
  /** [lat, lng, gap] */
  line: [number, number, 0 | 1][];
}

/** When nothing is in view: the closest public trips (by the middle of their route). */
export interface NearestTrip {
  id: string;
  title: string;
  author: string | null;
  distanceKm: number;
  center: [number, number];
  /** [south, west, north, east] */
  bbox: [number, number, number, number];
}

export interface ReportedTrip {
  id: string;
  title: string | null;
  visibility: Visibility;
  hidden_at: string | null;
  display_name: string | null;
  count: number;
  reasons: string[];
  details: string[];
}

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: "home", label: "Shows where someone lives" },
  { id: "person", label: "Shares something about me without asking" },
  { id: "spam", label: "Spam or fake" },
  { id: "offensive", label: "Offensive name or photos" },
  { id: "other", label: "Something else" },
];

export class PublicError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new PublicError("You appear to be offline.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new PublicError(typeof body.message === "string" ? body.message : "Something went wrong", res.status, body);
  return body as T;
}

const post = <T>(body: unknown) =>
  request<T>("/api/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const tripUrl = (id: string) => `${window.location.origin}/t/${id}`;
export const sharedPhotoUrl = (tripId: string, photoId: string) =>
  `/api/photo?trip=${encodeURIComponent(tripId)}&photo=${encodeURIComponent(photoId)}`;

export const getMe = () => request<{ displayName: string | null; isAdmin: boolean }>("/api/public?me=1");
export const setDisplayName = (displayName: string) => post<{ displayName: string }>({ action: "profile", displayName });
export const getShareSettings = (tripId: string) => request<ShareSettings>(`/api/public?settings=${tripId}`);
export const saveShareSettings = (tripId: string, s: { visibility: Visibility; hideM: number; photos: string[] }) =>
  post<ShareSettings>({ action: "settings", trip: tripId, ...s });
export const getPublicTrip = (id: string) => request<PublicTrip>(`/api/public?trip=${encodeURIComponent(id)}`);
export const countView = (id: string) => post<{ ok: boolean }>({ action: "view", trip: id }).catch(() => undefined);
export const reportTrip = (id: string, reason: string, details: string) =>
  post<{ ok: true }>({ action: "report", trip: id, reason, details });
export const exploreArea = (b: { south: number; west: number; north: number; east: number }, signal?: AbortSignal) =>
  request<{ trips: ExploreTrip[]; nearest: NearestTrip[] }>(
    `/api/public?explore=1&s=${b.south.toFixed(4)}&w=${b.west.toFixed(4)}&n=${b.north.toFixed(4)}&e=${b.east.toFixed(4)}`,
    { signal },
  );
export const getReports = () => request<{ reports: ReportedTrip[] }>("/api/public?reports=1");
export const moderate = (trip: string, decision: "restore" | "remove") => post<{ ok: true }>({ action: "moderate", trip, decision });
