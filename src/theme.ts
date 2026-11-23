import { useSyncExternalStore } from "react";
import { callApp, isInApp } from "./services/appBridge";

// Appearance: System (default) follows the phone; Light or Dark override it.

export type ThemePref = "system" | "light" | "dark";
const KEY = "theme";
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let pref: ThemePref = readPref();
const listeners = new Set<() => void>();

export const resolvedTheme = (): "light" | "dark" =>
  pref === "system" ? (media?.matches ? "dark" : "light") : pref;

function apply() {
  const dark = resolvedTheme() === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#151B1F" : "#0E6B4F");
  // The app draws the status/navigation bar area around the page.
  if (isInApp()) void callApp({ type: "theme", dark });
  listeners.forEach((l) => l());
}

media?.addEventListener("change", () => pref === "system" && apply());
apply();

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* per-device preference only */
  }
  apply();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** { pref, theme }: what was chosen, and what's in effect. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, resolvedTheme);
  const chosen = useSyncExternalStore(subscribe, () => pref);
  return { pref: chosen, theme, setPref: setThemePref };
}
