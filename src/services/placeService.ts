import { haversine } from "../utils/geo";
import { nominatimGet } from "./nominatimClient";

// Place details from OpenStreetMap's Nominatim. Hours, phone, photos etc. only
// exist where OSM volunteers have added them.

export interface PoiHint {
  /** Names from the map tile, in any language (used to confirm we found the same place). */
  names: string[];
  /** Map category, e.g. "cafe", "restaurant". */
  kind?: string;
  lat: number;
  lng: number;
}

export interface InfoItem {
  label: string;
  value: string;
}

export interface LinkItem {
  label: string;
  href: string;
}

export interface PlaceDetails {
  id: string;
  lat: number;
  lng: number;
  /** null for a plain dropped pin */
  name: string | null;
  category: string | null;
  cuisine: string | null;
  address: string | null;
  countryCode: string | null;
  openingHours: string | null;
  phones: string[];
  website: string | null;
  email: string | null;
  social: LinkItem[];
  /** Accessibility, payment, diet, entry fee and so on */
  info: InfoItem[];
  features: string[];
  osmUrl: string | null;
  /** For a photo and description of notable places */
  wikipedia: string | null;
  wikidata: string | null;
  /** Whether opening hours make sense for this kind of place (a shop yes, a monument no). */
  expectsHours: boolean;
}

// Kinds of places that normally keep hours.
const HOURS_CATEGORIES = new Set(["amenity", "shop", "tourism", "leisure", "office", "craft", "healthcare", "club"]);
const NO_HOURS_TYPES = new Set(["atm", "bench", "parking", "toilets", "drinking_water", "viewpoint", "artwork", "park", "attraction"]);

interface NominatimPlace {
  error?: string;
  osm_type?: string;
  osm_id?: number;
  place_id?: number;
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

const DETAIL_PARAMS = "format=jsonv2&addressdetails=1&extratags=1&namedetails=1";

/** All Nominatim traffic goes through the shared, rate-limited client. */
const nominatim = <T,>(path: string, signal?: AbortSignal) => nominatimGet<T>(path, signal);

async function reverse(lat: number, lng: number, layer: "poi" | "address", signal: AbortSignal) {
  const body = await nominatim<NominatimPlace>(
    `/reverse?${DETAIL_PARAMS}&zoom=18&layer=${layer}&lat=${lat}&lon=${lng}`,
    signal,
  );
  return body.error ? null : body;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Did Nominatim return the same place the map icon showed? */
function sameAsHint(found: NominatimPlace, hint: PoiHint): boolean {
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

function addressLine(found: NominatimPlace): string | null {
  const a = found.address;
  const fromDisplay = () => found.display_name?.split(",").slice(0, 4).join(",").trim() ?? null;
  if (!a) return fromDisplay();
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district;
  const city = a.city ?? a.town ?? a.village ?? a.county ?? a.state_district;
  const parts = [street, area, city, a.state, a.postcode].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : fromDisplay();
}

const yes = (v?: string) => v === "yes" || v === "only" || v === "designated";

function featureList(t: Record<string, string>): string[] {
  const out: string[] = [];
  if (yes(t.takeaway)) out.push("Takeaway");
  if (yes(t.delivery)) out.push("Delivery");
  if (yes(t.outdoor_seating)) out.push("Outdoor seating");
  if (["wlan", "wifi", "yes"].includes(t.internet_access)) out.push("Wi-Fi");
  if (yes(t.air_conditioning)) out.push("Air-conditioned");
  if (yes(t.reservation) || t.reservation === "recommended") out.push("Reservations");
  if (yes(t.drive_through)) out.push("Drive-through");
  return out;
}

const PAYMENT: Record<string, string> = {
  cash: "Cash",
  credit_cards: "Credit cards",
  debit_cards: "Debit cards",
  cards: "Cards",
  contactless: "Contactless",
  upi: "UPI",
  paytm: "Paytm",
  google_pay: "Google Pay",
  apple_pay: "Apple Pay",
  suica: "Suica",
  pasmo: "PASMO",
};

function infoList(t: Record<string, string>): InfoItem[] {
  const info: InfoItem[] = [];
  const wheelchair = { yes: "Accessible", limited: "Partly accessible", no: "Not accessible" }[t.wheelchair];
  if (wheelchair) info.push({ label: "Wheelchair", value: wheelchair });

  const payments = Object.entries(PAYMENT)
    .filter(([k]) => yes(t[`payment:${k}`]))
    .map(([, v]) => v);
  if (payments.length) info.push({ label: "Payment", value: payments.join(", ") });

  const diet = [
    t["diet:vegetarian"] === "only" ? "Vegetarian only" : yes(t["diet:vegetarian"]) ? "Vegetarian options" : null,
    t["diet:vegan"] === "only" ? "Vegan only" : yes(t["diet:vegan"]) ? "Vegan options" : null,
    yes(t["diet:halal"]) ? "Halal" : null,
    yes(t["diet:jain"]) ? "Jain" : null,
  ].filter(Boolean) as string[];
  if (diet.length) info.push({ label: "Food", value: diet.join(", ") });

  const smoking = { no: "No smoking", outside: "Outside only", yes: "Allowed", separated: "Separate area" }[t.smoking];
  if (smoking) info.push({ label: "Smoking", value: smoking });

  if (t.fee === "no") info.push({ label: "Entry", value: "Free" });
  else if (t.fee === "yes") info.push({ label: "Entry", value: t.charge ? `Paid (${t.charge})` : "Paid" });

  const by = t.brand ?? t.operator;
  if (by) info.push({ label: t.brand ? "Brand" : "Operated by", value: by });
  if (t.level) info.push({ label: "Floor", value: t.level });
  return info;
}

const SOCIAL: [string, string][] = [
  ["contact:instagram", "Instagram"],
  ["contact:facebook", "Facebook"],
  ["contact:twitter", "X (Twitter)"],
  ["contact:tripadvisor", "Tripadvisor"],
  ["contact:youtube", "YouTube"],
];

function socialLinks(t: Record<string, string>): LinkItem[] {
  return SOCIAL.map(([key, label]) => ({ label, href: safeWebsite(t[key]) }))
    .filter((l): l is LinkItem => !!l.href);
}

function splitList(v?: string): string[] {
  return v ? v.split(";").map((s) => s.trim()).filter(Boolean) : [];
}

/** Builds the details shown on a place sheet from a Nominatim result. */
export function toPlaceDetails(
  found: NominatimPlace | null,
  opts: { matched: boolean; lat: number; lng: number; hintName?: string | null; hintKind?: string },
): PlaceDetails {
  const t = opts.matched ? (found?.extratags ?? {}) : {};
  const osmType = opts.matched ? found?.osm_type : null;
  const lat = opts.matched && found?.lat ? Number(found.lat) : opts.lat;
  const lng = opts.matched && found?.lon ? Number(found.lon) : opts.lng;
  return {
    id: osmType && found?.osm_id ? `${osmType}/${found.osm_id}` : `pin/${lat.toFixed(6)},${lng.toFixed(6)}`,
    lat,
    lng,
    name: opts.matched ? (found?.name || opts.hintName || null) : (opts.hintName ?? null),
    category: opts.matched
      ? categoryLabel(found?.category, found?.type)
      : opts.hintKind
        ? humanize(opts.hintKind)
        : null,
    cuisine: t.cuisine ? splitList(t.cuisine).map(humanize).join(", ") : null,
    address: found ? addressLine(found) : null,
    countryCode: found?.address?.country_code ?? null,
    openingHours: t.opening_hours ?? null,
    phones: [...splitList(t.phone), ...splitList(t["contact:phone"]), ...splitList(t.mobile)].filter(
      (p, i, all) => all.indexOf(p) === i,
    ),
    website: safeWebsite(t.website ?? t["contact:website"]),
    email: t.email ?? t["contact:email"] ?? null,
    social: socialLinks(t),
    info: infoList(t),
    features: featureList(t),
    osmUrl:
      osmType && found?.osm_id && ["node", "way", "relation"].includes(osmType)
        ? `https://www.openstreetmap.org/${osmType}/${found.osm_id}`
        : null,
    wikipedia: t.wikipedia ?? null,
    wikidata: t.wikidata ?? null,
    expectsHours: opts.matched
      ? HOURS_CATEGORIES.has(found?.category ?? "") && !NO_HOURS_TYPES.has(found?.type ?? "")
      : !!opts.hintKind,
  };
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
    let found: NominatimPlace | null = null;
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

    return toPlaceDetails(found, {
      matched,
      lat: hint?.lat ?? lat,
      lng: hint?.lng ?? lng,
      hintName: hint?.names.find(Boolean) ?? null,
      hintKind: hint?.kind,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Fresh details for a place known by its OpenStreetMap id (e.g. a saved or shared place). */
export async function lookupById(id: string, signal?: AbortSignal): Promise<PlaceDetails | null> {
  const m = id.match(/^(node|way|relation)\/(\d+)$/);
  if (!m) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  signal?.addEventListener("abort", () => controller.abort());
  try {
    const prefix = { node: "N", way: "W", relation: "R" }[m[1] as "node" | "way" | "relation"];
    const found = await nominatim<NominatimPlace[]>(`/lookup?${DETAIL_PARAMS}&osm_ids=${prefix}${m[2]}`, controller.signal);
    const p = found[0];
    if (!p?.lat || !p.lon) return null;
    return toPlaceDetails(p, { matched: true, lat: Number(p.lat), lng: Number(p.lon) });
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Nearby listings ----------

export interface NearbyCategory {
  id: string;
  label: string;
  /** Nominatim "special phrase" that finds this kind of place */
  query: string;
  /** OSM types to keep (drops the odd mismatch) */
  types: string[];
}

export const NEARBY_CATEGORIES: NearbyCategory[] = [
  { id: "restaurant", label: "Restaurants", query: "restaurant", types: ["restaurant", "fast_food", "food_court"] },
  { id: "cafe", label: "Cafes", query: "cafe", types: ["cafe"] },
  { id: "fuel", label: "Petrol", query: "fuel", types: ["fuel"] },
  { id: "atm", label: "ATMs", query: "atm", types: ["atm"] },
  { id: "hotel", label: "Hotels", query: "hotel", types: ["hotel", "hostel", "guest_house", "motel"] },
  { id: "hospital", label: "Hospitals", query: "hospital", types: ["hospital", "clinic"] },
  { id: "pharmacy", label: "Pharmacies", query: "pharmacy", types: ["pharmacy", "chemist"] },
];

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface NearbyResult {
  place: PlaceDetails;
  distanceM: number;
}

/** Up to 40 places of a kind inside the visible map, nearest first. */
export async function searchNearby(
  category: NearbyCategory,
  bounds: Bounds,
  from: { lat: number; lng: number },
  signal: AbortSignal,
): Promise<NearbyResult[]> {
  const viewbox = [bounds.west, bounds.north, bounds.east, bounds.south].map((n) => n.toFixed(5)).join(",");
  const items = await nominatim<NominatimPlace[]>(
    `/search?${DETAIL_PARAMS}&q=${encodeURIComponent(category.query)}&viewbox=${viewbox}&bounded=1&limit=40`,
    signal,
  );
  return items
    .filter((p) => p.type && category.types.includes(p.type) && p.lat && p.lon)
    .map((p) => {
      const place = toPlaceDetails(p, { matched: true, lat: Number(p.lat), lng: Number(p.lon) });
      return { place, distanceM: haversine(from, { lat: place.lat, lng: place.lng }) };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}
