/// <reference lib="webworker" />
// The app's service worker: the app itself works offline (precached), maps you
// have looked at stay available for a while, and areas you saved stay for good.

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { SAVED_CACHE, TILE_RE, savedTileKey } from "./tiles";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.addEventListener("install", () => void self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Every page of the app (also /t/…, /live/… opened offline) is the app itself.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/api\//, /^\/\.well-known\//, /^\/privacy/] }),
);

const ok = new CacheableResponsePlugin({ statuses: [0, 200] });

// Map tiles: as you browse (kept a week), else from a saved area.
const browsed = new CacheFirst({
  cacheName: "map-tiles",
  plugins: [ok, new ExpirationPlugin({ maxEntries: 3000, maxAgeSeconds: 7 * 24 * 3600 })],
});
registerRoute(
  ({ url }) => TILE_RE.test(url.href),
  async (options) => {
    const m = options.request.url.match(TILE_RE)!;
    try {
      return await browsed.handle(options);
    } catch (error) {
      const saved = await (await caches.open(SAVED_CACHE)).match(savedTileKey(m[1], m[2], m[3]));
      if (saved) return saved;
      throw error;
    }
  },
);

// What the map needs besides tiles: its style, the tile index, icons. Small; refreshed when online.
registerRoute(
  ({ url }) => url.origin === "https://tiles.openfreemap.org" && /^\/(styles\/|sprites\/|planet$)/.test(url.pathname),
  new StaleWhileRevalidate({ cacheName: "map-style", plugins: [ok] }),
);

// Label fonts and the low-zoom world shading.
registerRoute(
  ({ url }) => url.origin === "https://tiles.openfreemap.org" && /^\/(fonts|natural_earth)\//.test(url.pathname),
  new CacheFirst({ cacheName: "map-assets", plugins: [ok, new ExpirationPlugin({ maxEntries: 1500, maxAgeSeconds: 60 * 24 * 3600 })] }),
);

// World borders for the Explored map: downloaded the first time it's opened,
// then kept (they change once in years; a new version gets a new ?v=).
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/borders/"),
  new CacheFirst({ cacheName: "borders", plugins: [ok, new ExpirationPlugin({ maxEntries: 4 })] }),
);

// Place search results (recent searches work offline).
registerRoute(
  ({ url }) => url.origin === "https://nominatim.openstreetmap.org" && url.pathname.startsWith("/search"),
  new CacheFirst({ cacheName: "search-cache", plugins: [ok, new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 3600 })] }),
);
