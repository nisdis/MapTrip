// Serves the real /api functions locally for browser tests (Vercel runs them in
// production). Started by playwright.config.ts; the Vite preview proxies /api here.
import http from "node:http";
import * as auth from "../../api/auth";
import * as trips from "../../api/trips";
import * as saved from "../../api/saved";
import * as share from "../../api/share";
import * as live from "../../api/live";
import * as pub from "../../api/public";

type Mod = Record<string, ((r: Request) => Promise<Response>) | undefined>;
const PORT = Number(process.env.API_PORT ?? 3999);

function route(path: string): Mod | null {
  if (path.startsWith("/api/auth")) return auth as unknown as Mod;
  if (path === "/api/trips") return trips as unknown as Mod;
  if (path === "/api/saved") return saved as unknown as Mod;
  if (path === "/api/live") return live as unknown as Mod;
  if (path === "/api/public") return pub as unknown as Mod;
  if (path.startsWith("/p/")) return share as unknown as Mod;
  return null;
}

http
  .createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const handler = route(url.pathname)?.[req.method ?? "GET"];
    if (!handler) {
      res.writeHead(404).end("not found");
      return;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const response = await handler(
      new Request(url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Buffer.concat(chunks),
      }),
    );
    const out: Record<string, string | string[]> = {};
    response.headers.forEach((v, k) => k !== "set-cookie" && (out[k] = v));
    const cookies = response.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;
    res.writeHead(response.status, out).end(Buffer.from(await response.arrayBuffer()));
  })
  .listen(PORT, () => console.log(`test api on ${PORT}`));
