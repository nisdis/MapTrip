import { haversine } from "../utils/geo";

// Details for a tapped spot, from OpenStreetMap's Nominatim.
// Opening hours, phone and website only exist where OSM volunteers have added them.

export interface PoiHint {
  /** Names from the map tile, in any language (used to confirm we found the same place). */
  names: string[];
  /** Map category, e.g. "cafe", "restaurant". */
  kind?: string;
  lat: number;
  lng: number;
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  /** null for a plain dropped pin */
  name: string | null;
  category: string | null;
  cuisine: string | null;
  address: string | null;
  countryCode: string | null;
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  features: string[];
  osmUrl: string | null;
}

interface NominatimReverse {
  error?: string;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  category?: string;
  type?: string;
  display_name?: string;
  address?: Record<string, string>;
  namedetails?: Record<string, string>;
  extratags?: Record<string, string>;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const MIN_GAP_MS = 1100; // Nominatim allows about one request per second
let lastRequestAt = 0;

async function politeDelay(signal: AbortSignal) {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  lastRequestAt = Math.max(Date.now(), lastRequestAt + MIN_GAP_MS);
  if (wait <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, wait);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

async function reverse(
  lat: number,
  lng: number,
  layer: "poi" | "address",
  signal: AbortSignal,
): Promise<NominatimReverse | null> {
  await politeDelay(signal);
  const url =
    `${ENDPOINT}?format=jsonv2&zoom=18&addressdetails=1&extratags=1&namedetails=1` +
    `&layer=${layer}&lat=${lat}&lon=${lng}`;
  const response = await fetch(url, { signal, headers: { "Accept-Language": "en" } });
  if (!response.ok) throw new Error(`Place lookup failed (${response.status})`);
  const body = (await response.json()) as NominatimReverse;
  return body.error ? null : body;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Did Nominatim return the same place the map icon showed? */
function sameAsHint(found: NominatimReverse, hint: PoiHint): boolean {
  const candidates = [found.name, ...Object.values(found.namedetails ?? {})]
    .filter((v): v is string => !!v)
    .map(norm);
  return hint.names.map(norm).some((n) => n && candidates.includes(n));
}

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function categoryLabel(category?: string, type?: string): string | null {
  if (!type || ["yes", "building", "house", "residential", "unclassified"].includes(type)) {
    return category && !["place", "highway", "boundary"].includes(category) ? humanize(category) : null;
  }
  if (category === "shop" && !/shop|store|market|mall/.test(type)) return `${humanize(type)} shop`;
  return humanize(type);
}

/** Only http(s) links are shown, so a bad tag can never become a javascript: link. */
export function safeWebsite(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function addressLine(found: NominatimReverse): string | null {
  const a = found.address;
  if (!a) return found.display_name?.split(",").slice(0, 4).join(",").trim() ?? null;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district;
  const city = a.city ?? a.town ?? a.village ?? a.county ?? a.state_district;
  const parts = [street, area, city, a.state, a.postcode].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : (found.display_name?.split(",").slice(0, 4).join(",").trim() ?? null);
}

function featureList(tags: Record<string, string>): string[] {
  const out: string[] = [];
  if (tags.takeaway === "yes" || tags.takeaway === "only") out.push("Takeaway");
  if (tags.delivery === "yes") out.push("Delivery");
  if (tags.outdoor_seating === "yes") out.push("Outdoor seating");
  if (["wlan", "wifi", "yes"].includes(tags.internet_access)) out.push("Wi-Fi");
  if (tags.air_conditioning === "yes") out.push("Air-conditioned");
  if (tags["diet:vegetarian"] === "yes" || tags["diet:vegetarian"] === "only") out.push("Vegetarian options");
  if (tags.wheelchair === "yes") out.push("Wheelchair accessible");
  return out;
}

export async function lookupPlace(
  lat: number,
  lng: number,
  hint: PoiHint | null,
  /** How close (metres) a named place must be to the tap to count as "the place you tapped". */
  toleranceM: number,
  outerSignal?: AbortSignal,
): Promise<PlaceDetails> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  outerSignal?.addEventListener("abort", () => controller.abort());
  const { signal } = controller;

  try {
    let found: NominatimReverse | null = null;
    let matched = false;

    if (hint) {
      // The icon's own coordinates identify the place exactly.
      const poi = await reverse(hint.lat, hint.lng, "poi", signal);
      if (poi && sameAsHint(poi, hint)) {
        found = poi;
        matched = true;
      }
    }
    if (!found) {
      // No icon was tapped (the map draws only some places). Take the nearest named
      // place only if it is right under the finger; never a shop that is merely nearby.
      const near = await reverse(lat, lng, "poi", signal);
      if (
        near?.name &&
        near.lat &&
        near.lon &&
        haversine({ lat, lng }, { lat: Number(near.lat), lng: Number(near.lon) }) <= toleranceM
      ) {
        found = near;
        matched = true;
      }
    }
    if (!found) found = await reverse(hint?.lat ?? lat, hint?.lng ?? lng, "address", signal);

    const tags = matched ? (found?.extratags ?? {}) : {};
    const hintName = hint?.names.find(Boolean) ?? null;
    const osmType = matched ? found?.osm_type : null;

    return {
      lat: matched && found?.lat ? Number(found.lat) : (hint?.lat ?? lat),
      lng: matched && found?.lon ? Number(found.lon) : (hint?.lng ?? lng),
      name: matched ? (found?.name ?? hintName) : hintName,
      category: matched
        ? categoryLabel(found?.category, found?.type)
        : hint?.kind
          ? humanize(hint.kind)
          : null,
      cuisine: tags.cuisine ? tags.cuisine.split(";").map((c) => humanize(c.trim())).join(", ") : null,
      address: found ? addressLine(found) : null,
      countryCode: found?.address?.country_code ?? null,
      openingHours: tags.opening_hours ?? null,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      website: safeWebsite(tags.website ?? tags["contact:website"]),
      features: featureList(tags),
      osmUrl:
        osmType && found?.osm_id && ["node", "way", "relation"].includes(osmType)
          ? `https://www.openstreetmap.org/${osmType}/${found.osm_id}`
          : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
