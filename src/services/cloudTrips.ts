import type { Trip } from "../types/trip";
import { supabase } from "./supabase";

/** Upserts a trip for the signed-in user. Throws if not signed in / on error. */
export async function saveTripToCloud(trip: Trip): Promise<number> {
  if (!supabase) throw new Error("Cloud save is not configured");
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Please sign in to save to the cloud");

  const syncedAt = Date.now();
  // `data` holds the whole trip; row-level security restricts rows to their owner.
  const { error } = await supabase.from("trips").upsert({
    id: trip.id,
    user_id: user.id,
    data: { ...trip, cloudSyncedAt: syncedAt },
    created_at: new Date(trip.createdAt).toISOString(),
  });
  if (error) throw new Error(error.message);
  return syncedAt;
}
