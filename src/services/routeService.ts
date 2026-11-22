// Drive time from you to a place, from the same routing server Directions uses.
export interface DriveEstimate {
  distanceM: number;
  durationS: number;
}

export async function driveEstimate(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<DriveEstimate | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?overview=false&alternatives=false&steps=false`,
      { signal },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { code?: string; routes?: { distance: number; duration: number }[] };
    const r = body.code === "Ok" ? body.routes?.[0] : undefined;
    return r ? { distanceM: r.distance, durationS: r.duration } : null;
  } catch {
    return null;
  }
}

export function formatDriveTime(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
