// Service worker registration that picks up new builds of the app.
//
// The service worker serves the app from its cache (so it opens offline), which
// means a new build only reaches people once the browser has fetched the new
// sw.js and the page has reloaded. Browsers check sw.js only on navigation, and
// the phone app keeps one page open for hours, so we check ourselves: on start,
// whenever the app comes back to the foreground (the phone app also asks), every
// 15 minutes, and when you tap "Check for updates" in the menu.
//
// When a new version takes over we reload, but never in the middle of a trip:
// - not recording and the page is hidden: reload straight away (no one sees it);
// - not recording and visible: show "New version ready" with a Reload button
//   (banner and menu), and reload by itself the next time the page is hidden;
// - recording: wait until the trip is finished.
import { useSyncExternalStore } from "react";

const CHECK_EVERY_MS = 15 * 60 * 1000;

/** This build: the commit it was built from (or the build time locally). */
export const BUILD_ID: string = __BUILD_ID__;

export type UpdateStatus = "idle" | "checking" | "current" | "downloading" | "ready" | "offline" | "failed";

let status: UpdateStatus = "idle";
let busy = false; // a trip is being recorded
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<() => void>();
const setStatus = (s: UpdateStatus) => {
  status = s;
  listeners.forEach((l) => l());
};

function reloadIfSafe(force = false) {
  if (status !== "ready" || busy) return;
  if (force || document.visibilityState === "hidden") window.location.reload();
}

/** The app says whether a trip is being recorded (reloads wait for it to end). */
export function setUpdateBusy(value: boolean) {
  busy = value;
  if (!busy) reloadIfSafe();
  listeners.forEach((l) => l());
}

export function reloadNow() {
  reloadIfSafe(true);
}

/** Asks the server for a newer version now. Quiet: only the status changes. */
export async function checkForUpdate(): Promise<void> {
  if (status === "ready" || status === "checking" || status === "downloading") return;
  if (!registration) return setStatus("failed");
  if (!navigator.onLine) return setStatus("offline");
  setStatus("checking");
  try {
    await registration.update();
  } catch {
    return setStatus(navigator.onLine ? "failed" : "offline");
  }
  // A newer worker is installing (it takes over by itself, see controllerchange).
  const incoming = registration.installing ?? registration.waiting;
  if (!incoming) return setStatus("current");
  setStatus("downloading");
  incoming.addEventListener("statechange", () => {
    if (incoming.state === "redundant" && status === "downloading") setStatus("failed");
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Where the update check stands, and whether reloading is allowed right now. */
export function useUpdate(): { status: UpdateStatus; canReload: boolean } {
  const s = useSyncExternalStore(subscribe, () => status);
  const b = useSyncExternalStore(subscribe, () => busy);
  return { status: s, canReload: s === "ready" && !b };
}

/** True when a new version is ready and a reload is allowed (for the banner). */
export function useUpdateReady(): boolean {
  return useUpdate().canReload;
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
    if (status === "ready") return;
    setStatus("ready");
    reloadIfSafe();
  });

  // The phone app calls this when it comes back to the foreground.
  (window as unknown as { __rmtCheckUpdate?: () => void }).__rmtCheckUpdate = () => void checkForUpdate();

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        const quietCheck = () => {
          if (navigator.onLine) reg.update().catch(() => undefined);
        };
        setInterval(quietCheck, CHECK_EVERY_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") quietCheck();
          else reloadIfSafe();
        });
        window.addEventListener("online", quietCheck);
      })
      .catch((error) => console.error("Service worker registration failed:", error));
  });
}
