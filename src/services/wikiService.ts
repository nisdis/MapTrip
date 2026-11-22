import { haversine } from "../utils/geo";

// A photo and short description for notable places, via the place's Wikipedia/Wikidata link.

export interface WikiSummary {
  description: string | null;
  extract: string | null;
  pageUrl: string | null;
  imageUrl: string | null;
  /** Where the photo's licence and author are shown */
  imagePageUrl: string | null;
}

interface WikiRestSummary {
  type?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } };
  titles?: { canonical?: string };
  coordinates?: { lat?: number; lon?: number };
}

const cache = new Map<string, Promise<WikiSummary | null>>();

async function summary(
  title: string,
  signal?: AbortSignal,
  /** If set, the article must be geotagged within 1 km of here (guards name-only matches). */
  near?: { lat: number; lng: number },
): Promise<WikiSummary | null> {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    { signal },
  );
  if (res.status === 404) return null; // no such article: a real answer
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`); // rate limit/outage: try again later
  const s = (await res.json()) as WikiRestSummary;
  if (s.type === "disambiguation") return null;
  if (near) {
    const c = s.coordinates;
    if (c?.lat == null || c?.lon == null) return null;
    if (haversine(near, { lat: c.lat, lng: c.lon }) > 1000) return null;
  }
  const pageUrl = s.content_urls?.mobile?.page ?? s.content_urls?.desktop?.page ?? null;
  return {
    description: s.description ?? null,
    extract: s.extract ?? null,
    pageUrl,
    imageUrl: s.thumbnail?.source ?? null,
    imagePageUrl: s.thumbnail?.source && pageUrl ? pageUrl : null,
  };
}

async function fromWikidata(qid: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  const res = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}` +
      `&props=sitelinks|claims&sitefilter=enwiki&format=json&origin=*`,
    { signal },
  );
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const body = (await res.json()) as {
    entities?: Record<
      string,
      {
        sitelinks?: { enwiki?: { title?: string } };
        claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] };
      }
    >;
  };
  const entity = body.entities ? Object.values(body.entities)[0] : undefined;
  const title = entity?.sitelinks?.enwiki?.title;
  if (title) {
    const s = await summary(title, signal);
    if (s) return s;
  }
  const file = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;
  return {
    description: null,
    extract: null,
    pageUrl: null,
    imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=640`,
    imagePageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
  };
}

/** null when the place has no usable Wikipedia/Wikidata link. Never throws. */
export function fetchWikiSummary(
  wikipedia: string | null,
  wikidata: string | null,
  /** Used only when the place has no Wikipedia/Wikidata link of its own. */
  fallback?: { name: string; lat: number; lng: number },
): Promise<WikiSummary | null> {
  if (!wikipedia && !wikidata && !fallback) return Promise.resolve(null);
  const key = `${wikipedia ?? ""}|${wikidata ?? ""}|${fallback ? `${fallback.name}@${fallback.lat.toFixed(3)},${fallback.lng.toFixed(3)}` : ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const run = (async () => {
    try {
      // "en:Title" can be used directly; other languages go through Wikidata to find English.
      const m = wikipedia?.match(/^en:(.+)$/);
      if (m) {
        const s = await summary(m[1]);
        if (s) return s;
      }
      if (wikidata && /^Q\d+$/.test(wikidata)) return await fromWikidata(wikidata);
      // OSM sometimes keeps the Wikipedia link on a sibling object (e.g. the building,
      // not the monument). Try the exact name, but only accept a geotagged article
      // that is right here, so a chain's or namesake's article can't slip in.
      if (fallback && !wikipedia && !wikidata) {
        return await summary(fallback.name, undefined, { lat: fallback.lat, lng: fallback.lng });
      }
      return null;
    } catch {
      cache.delete(key); // a network blip shouldn't hide the photo for the rest of the session
      return null;
    }
  })();
  cache.set(key, run);
  return run;
}
