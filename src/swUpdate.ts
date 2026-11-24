// Service worker registration that picks up new builds of the app.
//
// The service worker serves the app from its cache (so it opens offline), which
// means a new build only reaches people once the browser has fetched the new
// sw.js and the page has reloaded. Browsers check sw.js only on navigation, and
// the phone app keeps one page open for hours, so we check ourselves: on start,
// whenever the app comes back to the foreground, and every 15 minutes.
//
// When a new version takes over we reload, but never in the middle of a trip:
// - not recording and the page is hidden: reload straight away (no one sees it);
// - not recording and visible: show "New version ready" with a Reload button,
//   and reload by itself the next time the page is hidden;
// - recording: wait until the trip is finished.
import { useSyncExternalStore } from "react";

const CHECK_EVERY_MS = 15 * 60 * 1000;

let ready = false; // a new version controls the page; the page still runs the old one
let busy = false; // a trip is being recorded
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function reloadIfSafe(force = false) {
  if (!ready || busy) return;
  if (force || document.visibilityState === "hidden") window.location.reload();
}

/** The app says whether a trip is being recorded (reloads wait for it to end). */
export function setUpdateBusy(value: boolean) {
  busy = value;
  if (!busy) reloadIfSafe();
  notify();
}

export function reloadNow() {
  reloadIfSafe(true);
}

/** True when a new version is ready and a reload is allowed (for the banner). */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready && !busy,
  );
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // On a first visit the worker takes control without a new version: skip that one change.
  let firstInstall = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (firstInstall) {
      firstInstall = false;
      return;
    }
    if (ready) return;
    ready = true;
    notify();
    reloadIfSafe();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        const check = () => {
          if (navigator.onLine) reg.update().catch(() => undefined);
        };
        setInterval(check, CHECK_EVERY_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
          else reloadIfSafe();
        });
        window.addEventListener("online", check);
      })
      .catch((error) => console.error("Service worker registration failed:", error));
  });
}
