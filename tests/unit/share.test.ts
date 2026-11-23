import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../api/share";

const place = [
  {
    name: "Gateway of India",
    type: "monument",
    category: "historic",
    address: { road: "Apollo Bandar", city: "Mumbai", state: "Maharashtra" },
    extratags: { wikipedia: "en:Gateway of India" },
  },
];

describe("share link previews", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/lookup")) return Response.json(place);
        if (url.includes("/reverse")) return Response.json({ address: { road: "MG Road", city: "Bengaluru" } });
        if (url.includes("wikipedia")) return Response.json({ thumbnail: { source: "https://upload.wikimedia.org/g.jpg" } });
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const get = (path: string) => GET(new Request(`https://map.recordmytrip.com${path}`));

  it("describes an exact place with name, address and photo", async () => {
    const res = await get("/p/way/28845634");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<meta property="og:title" content="Gateway of India">');
    expect(html).toContain("Apollo Bandar, Mumbai, Maharashtra");
    expect(html).toContain('og:image" content="https://upload.wikimedia.org/g.jpg"');
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("escapes everything that came from the link", async () => {
    const html = await (await get("/p/pin/1,2?n=%3Cscript%3Ealert(1)%3C%2Fscript%3E%22%3E")).text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects malformed ids", async () => {
    const res = await get("/p/node/abc");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("<title>Map Trip</title>");
  });

  it("caches only briefly when a lookup failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const res = await get("/p/node/123");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=300");
  });
});
