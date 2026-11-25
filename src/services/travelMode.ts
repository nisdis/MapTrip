import type { SearchResult } from "./searchService";

// How you're travelling, for Directions.
//
// Car uses the same routing server as before (or your own, VITE_OSRM_URL).
// That public server only has car routes: ask it to walk and it still drives.
// Bike and walk come from the OpenStreetMap community's routing servers (the
// ones openstreetmap.org's own directions use), free for fair use.
// Public transport needs timetables no free service covers well, so it opens
// Google Maps instead.
export type TravelMode = "car" | "bike" | "foot";

export const TRAVEL_MODES: { mode: TravelMode; label: string }[] = [
  { mode: "car", label: "Car" },
  { mode: "bike", label: "Bike" },
  { mode: "foot", label: "Walk" },
];

/** Where leaflet-routing-machine's OSRM router should ask, for this mode. */
export function routerFor(mode: TravelMode): { serviceUrl: string; profile: string } {
  if (mode === "car") {
    return {
      serviceUrl: import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org/route/v1",
      profile: "driving",
    };
  }
  // These servers pick the mode by path; the profile part of the URL is always "driving".
  return { serviceUrl: `https://routing.openstreetmap.de/routed-${mode}/route/v1`, profile: "driving" };
}

/** The same trip by public transport, in Google Maps (no origin: from where you are). */
export function transitUrl(origin: SearchResult | null, destination: SearchResult): string {
  const at = (p: SearchResult) => `${p.location[0].toFixed(6)},${p.location[1].toFixed(6)}`;
  const q = new URLSearchParams({ api: "1", destination: at(destination), travelmode: "transit" });
  if (origin) q.set("origin", at(origin));
  return `https://www.google.com/maps/dir/?${q}`;
}

const KEY = "travelMode";

export function loadTravelMode(): TravelMode {
  try {
    const m = localStorage.getItem(KEY);
    if (m === "car" || m === "bike" || m === "foot") return m;
  } catch {
    /* default */
  }
  return "car";
}

export function saveTravelMode(mode: TravelMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* only a convenience */
  }
}
