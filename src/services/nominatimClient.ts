// The one way the app talks to OpenStreetMap's Nominatim (search, place details,
// nearby lists, lookups). Nominatim's free service allows about one request per
// second and blocks heavy users, so every request goes through one queue here,
// identical requests are shared, and recent answers are reused.

const BASE = "https://nominatim.openstreetmap.org";
export const MIN_GAP_MS = 1100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

let nextSlot = 0;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

/** Waits for this request's turn in the shared queue. */
async function waitForSlot(signal?: AbortSignal): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  const wait = slot - now;
  if (wait <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, wait);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(abortError());
    });
  });
}

async function request<T>(path: string): Promise<T> {
  await waitForSlot();
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Accept-Language": "en" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Map lookup failed (${response.status})`);
  return (await response.json()) as T;
}

/** Lets a caller stop waiting without cancelling a request others may share. */
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError()));
    promise.then(resolve, reject);
  });
}

/**
 * GET a Nominatim path (e.g. "/search?q=…"). Requests are spaced at least
 * MIN_GAP_MS apart across the whole app, identical in-flight requests are
 * shared, and successful answers are reused for 10 minutes.
 */
export function nominatimGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return withAbort(hit.value as Promise<T>, signal);

  const value = request<T>(path);
  cache.set(path, { at: Date.now(), value });
  value.catch(() => cache.delete(path)); // never keep a failure
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return withAbort(value, signal);
}

/** For tests. */
export function _resetNominatimClient() {
  nextSlot = 0;
  cache.clear();
}
