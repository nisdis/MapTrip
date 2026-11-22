import { readFile } from "node:fs/promises";
import path from "node:path";

// Shared place links (/p/node/123, /p/pin/12.97,77.59) get a page with link-preview
// tags (name, category, address, photo) so chat apps show the place, then the
// app loads and opens it. All values are escaped; ids are strictly validated.

const UA = "RecordMyTrip/1.0 (+https://map.recordmytrip.com)";
const OSM_RE = /^(node|way|relation)\/(\d{1,15})$/;
const PIN_RE = /^pin\/(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/;

interface Meta {
  title: string;
  description: string;
  image: string | null;
  /** false if a lookup failed: cache briefly so a blip isn't kept for a day */
  complete: boolean;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function getJson<T>(url: string, ms: number): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(ms) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

interface Nom {
  name?: string;
  type?: string;
  category?: string;
  address?: Record<string, string>;
  display_name?: string;
  extratags?: Record<string, string>;
}

function addressOf(p: Nom): string | null {
  const a = p.address;
  if (!a) return p.display_name?.split(",").slice(0, 3).join(",").trim() ?? null;
  const parts = [[a.house_number, a.road].filter(Boolean).join(" "), a.suburb ?? a.neighbourhood, a.city ?? a.town ?? a.village, a.state];
  return parts.filter(Boolean).join(", ") || null;
}

const humanize = (s?: string) => (s && s !== "yes" ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : null);

async function describe(kind: string, id: string, nameHint: string | null): Promise<Meta> {
  const fallback: Meta = { title: nameHint ?? "A place on Map Trip", description: "Open in Map Trip for directions.", image: null, complete: false };
  if (kind === "pin") {
    const m = id.match(PIN_RE);
    if (!m) return fallback;
    const rev = await getJson<Nom>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${m[1]}&lon=${m[2]}`,
      4000,
    );
    return {
      title: nameHint ?? "Dropped pin",
      description: [rev ? addressOf(rev) : null, `${Number(m[1]).toFixed(5)}, ${Number(m[2]).toFixed(5)}`].filter(Boolean).join(" · "),
      image: null,
      complete: !!rev,
    };
  }
  const m = id.match(OSM_RE);
  if (!m) return fallback;
  const prefix = { node: "N", way: "W", relation: "R" }[m[1] as "node" | "way" | "relation"];
  const found = await getJson<Nom[]>(
    `https://nominatim.openstreetmap.org/lookup?format=jsonv2&addressdetails=1&extratags=1&osm_ids=${prefix}${m[2]}`,
    4000,
  );
  const p = found?.[0];
  if (!p) return fallback;
  let image: string | null = null;
  let complete = true;
  const wiki = p.extratags?.wikipedia?.match(/^en:(.+)$/);
  if (wiki) {
    const s = await getJson<{ thumbnail?: { source?: string } }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki[1].replace(/ /g, "_"))}`,
      3000,
    );
    image = s?.thumbnail?.source ?? null;
    if (!s) complete = false;
  }
  const cuisine = p.extratags?.cuisine?.split(";")[0];
  return {
    title: p.name || nameHint || humanize(p.type) || "A place on Map Trip",
    description: [humanize(cuisine) ?? humanize(p.type), addressOf(p)].filter(Boolean).join(" · ") || fallback.description,
    image,
    complete,
  };
}

/** The built app page: from the function bundle, else from the site, else a tiny redirect page. */
async function appHtml(origin: string, appUrl: string): Promise<{ html: string; source: string }> {
  for (const file of [path.join(process.cwd(), "dist", "index.html"), path.join(process.cwd(), "index.html")]) {
    try {
      const html = await readFile(file, "utf8");
      if (html.includes("/assets/")) return { html, source: "fs" };
    } catch {
      /* try the next option */
    }
  }
  try {
    const res = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(3000) });
    const html = await res.text();
    if (res.ok && html.includes("/assets/")) return { html, source: "fetch" };
  } catch {
    /* fall through */
  }
  return {
    html: `<!doctype html><html><head><meta charset="utf-8"><title>Map Trip</title><meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}"></head><body><a href="${escapeHtml(appUrl)}">Open in Map Trip</a></body></html>`,
    source: "fallback",
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Rewrites keep the original path; fall back to query params just in case.
  const m = url.pathname.match(/^\/p\/(node|way|relation|pin)\/([^/]+)$/);
  const kind = m?.[1] ?? url.searchParams.get("type") ?? "";
  const rawId = decodeURIComponent(m?.[2] ?? url.searchParams.get("id") ?? "");
  const id = `${kind}/${rawId}`;
  const valid = OSM_RE.test(id) || PIN_RE.test(id);
  const nameHint = url.searchParams.get("n")?.slice(0, 80) || null;

  const meta: Meta = valid
    ? await describe(kind, id, nameHint)
    : { title: "Map Trip", description: "Maps and trips.", image: null, complete: true };
  const pageUrl = `${url.origin}${url.pathname}${nameHint ? `?n=${encodeURIComponent(nameHint)}` : ""}`;
  const appUrl = valid ? `/?osm=${encodeURIComponent(id)}` : "/";
  const { html, source } = await appHtml(url.origin, appUrl);

  const tags = [
    `<meta property="og:type" content="place">`,
    `<meta property="og:site_name" content="Map Trip">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}">` : "",
    `<meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}">`,
    `<meta name="description" content="${escapeHtml(meta.description)}">`,
  ].join("\n    ");

  const page = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(valid ? `${meta.title} · Map Trip` : "Map Trip")}</title>`)
    .replace(/<meta name="description"[^>]*>/, "")
    .replace("</head>", `    ${tags}\n  </head>`);

  return new Response(page, {
    status: valid ? 200 : 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Chat apps and the CDN share one cached copy, so Nominatim isn't hit per view.
      "Cache-Control": meta.complete
        ? "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
        : "public, max-age=60, s-maxage=300",
      "X-Share-Source": source,
    },
  });
}
