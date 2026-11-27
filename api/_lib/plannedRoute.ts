// Before saved routes, Directions saved "planned trips". They are routes, not
// trips, so they become saved routes (in Saved, synced like Favourites).
// Used on the device, by the database migration, and for old app versions that
// still send planned trips. No imports: used by both the web app and the server.

interface Point {
  name?: unknown;
  displayName?: unknown;
  location?: unknown;
}

const snapshot = (p: Point) => {
  const loc = Array.isArray(p?.location) ? p.location : [];
  const [lat, lng] = loc as unknown[];
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const name = typeof p.name === "string" ? p.name.slice(0, 300) : null;
  const display = typeof p.displayName === "string" ? p.displayName.slice(0, 400) : null;
  return {
    id: `pin/${lat.toFixed(6)},${lng.toFixed(6)}`,
    name,
    category: null,
    address: display && display !== name ? display : null,
    lat,
    lng,
    countryCode: null,
  };
};

/** The saved-route record for a planned trip (same key on every device: route:<trip id>), or null. */
export function routeFromPlanned(trip: { id?: unknown; name?: unknown; createdAt?: unknown; origin?: unknown; destination?: unknown }) {
  if (typeof trip.id !== "string") return null;
  const from = snapshot(trip.origin as Point);
  const to = snapshot(trip.destination as Point);
  if (!from || !to) return null;
  const createdAt = typeof trip.createdAt === "number" ? trip.createdAt : Date.now();
  return {
    key: `route:${trip.id}`,
    kind: "route" as const,
    list: "routes",
    place: to,
    route: {
      name: typeof trip.name === "string" && trip.name ? trip.name.slice(0, 200) : `${from.name ?? "Start"} → ${to.name ?? "End"}`,
      from,
      to,
      mode: "car" as const,
      path: null,
      distanceM: null,
      durationS: null,
    },
    note: null,
    createdAt,
    updatedAt: createdAt,
    deleted: false,
  };
}
