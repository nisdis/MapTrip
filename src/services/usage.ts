// Anonymous usage counts (see api/_lib/usage.ts): only the name of what
// happened. Never locations, trip ids or anything typed. Fire and forget:
// failures (offline) are simply not counted.

export type UsageEvent =
  | "app_open"
  | "trip_recorded"
  | "trip_shared"
  | "live_share_started"
  | "media_added"
  | "route_shown"
  | "route_saved"
  | "explore_opened"
  | "explored_opened"
  | "reaction_added"
  | "comment_added";

const DEVICE_KEY = "usageDevice";
const OPENED_KEY = "usageOpenedOn";

function device(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function track(name: UsageEvent): void {
  if (import.meta.env.DEV || (typeof navigator !== "undefined" && navigator.webdriver)) return; // not while developing or testing
  const id = device();
  if (!id || !navigator.onLine) return;
  void fetch("/api/public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "event", name, device: id }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Once per day per device: counts people using the app. */
export function trackAppOpen(): void {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(OPENED_KEY) === today) return;
    localStorage.setItem(OPENED_KEY, today);
  } catch {
    /* counted every time instead; the server counts people once a day anyway */
  }
  track("app_open");
}
