// Client for /api/social: follows (by request), blocks, profiles, feed, leaderboard.
import type { PublicStats, Visibility } from "./publicTrips";

export type Rel = "none" | "pending" | "approved";

export interface Relationship {
  following: Rel;
  followsMe: Rel;
  blockedByMe: boolean;
  blockedMe: boolean;
}

export interface TripCard {
  id: string;
  title: string;
  visibility: Visibility;
  imported: boolean;
  stats: PublicStats;
  views: number;
  /** the route as others see it (ends trimmed), encoded polylines */
  line?: string[];
  authorId?: string;
  author?: string | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  progress: number;
}

export interface Profile {
  userId: string;
  displayName: string;
  isMe: boolean;
  followers: number;
  following: number;
  relationship: Relationship;
  trips: TripCard[];
  achievements: Achievement[] | null;
  settings?: { leaderboard: boolean; showAchievements: boolean; showExplored: boolean };
  /** their Explored map's squares, if they show it (from trips you may see) */
  explored?: string[] | null;
}

export interface Person {
  userId: string;
  displayName: string | null;
  at: number;
}

export interface People {
  me: { userId: string; displayName: string | null; leaderboard: boolean; showAchievements: boolean; showExplored: boolean };
  requests: Person[];
  followers: Person[];
  following: Person[];
  sent: Person[];
  blocked: Person[];
}

export interface Leaderboard {
  period: "week" | "month";
  optedIn: boolean;
  rows: { rank: number; userId: string; displayName: string; km: number; trips: number; isMe: boolean }[];
}

export class SocialError extends Error {
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
    throw new SocialError("You appear to be offline.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new SocialError(typeof body.message === "string" ? body.message : "Something went wrong", res.status, body);
  return body as T;
}

const post = <T = { ok: true }>(body: unknown) =>
  request<T>("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const profileUrl = (userId: string) => `${window.location.origin}/u/${userId}`;
export const getProfile = (userId: string) => request<Profile>(`/api/social?profile=${encodeURIComponent(userId)}`);
export const getPeople = () => request<People>("/api/social?people=1");
export const getFeed = () => request<{ trips: TripCard[] }>("/api/social?feed=1");
export const getLeaderboard = (period: "week" | "month") => request<Leaderboard>(`/api/social?leaderboard=${period}`);

export const follow = (user: string) => post<{ ok: true; following: Rel }>({ action: "follow", user });
export const unfollow = (user: string) => post({ action: "unfollow", user });
export const respond = (user: string, accept: boolean) => post({ action: "respond", user, accept });
export const removeFollower = (user: string) => post({ action: "removeFollower", user });
export const block = (user: string) => post({ action: "block", user });
export const unblock = (user: string) => post({ action: "unblock", user });
export const saveSocialSettings = (s: { leaderboard?: boolean; showAchievements?: boolean; showExplored?: boolean }) =>
  post({ action: "settings", ...s });
