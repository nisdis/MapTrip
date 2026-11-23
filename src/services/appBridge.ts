// Talks to the Record My Trip app (mobile/) when the web app runs inside it.
//
// Inside the app, GPS comes from the app, not the browser: the app keeps
// recording while the phone is locked (when this page is frozen), saves every
// fix, and hands them over when the page wakes. While locked it also keeps the
// live share going, using what we tell it below.
//
// Web -> app:  window.flutter_inappwebview.callHandler("rmt", message)
// App -> web:  window.__rmtReceive(message)

export interface NativeFix {
  /** increasing number per fix, so nothing is applied twice */
  seq: number;
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
  accuracy: number;
  speed: number | null;
  /** uncertainty of `speed` in m/s, if the phone gives it */
  speedAccuracy?: number | null;
  altitude: number | null;
  heading: number | null;
}

export type NativeRecording = "idle" | "recording" | "paused";

export interface NativeHello {
  version: string;
  platform: string;
  recording: NativeRecording;
  /** fixes the page hasn't confirmed yet (e.g. recorded while the phone was locked) */
  pending: NativeFix[];
  share: { token: string; expiresAt: number } | null;
  /** phone brand/model (for the battery settings guide) */
  device?: { os: string; manufacturer: string; model: string; sdk: number };
  /** Android: is the app exempt from battery optimisation? */
  battery?: { unrestricted: boolean };
}

/** What the app needs to keep a live share going while this page is frozen. */
export interface ShareHandoff {
  token: string;
  expiresAt: number;
  /** time of the newest point the server has */
  lastT: number | null;
  status: "recording" | "paused";
  stats: {
    distanceM: number;
    estimatedM: number;
    maxSpeedMs: number;
    speedMs: number;
    altitudeM: number | null;
    activeSeconds: number;
  };
  /** last trail point, so the app continues the trail (and distance) from there */
  last: { lat: number; lng: number; t: number } | null;
  /** when the stats were taken (epoch ms) */
  at: number;
}

type AppMessage =
  | { type: "hello" }
  | { type: "recording"; state: NativeRecording; startedAt: number }
  | { type: "ack"; seq: number }
  | { type: "share"; share: ShareHandoff | null }
  | { type: "shareText"; title: string; text: string; url: string }
  | { type: "batteryStatus" }
  | { type: "theme"; dark: boolean }
  | { type: "saveFile"; name: string; mime: string; text: string }
  | { type: "openBatterySettings" };

type Incoming = { type: "fixes"; fixes: NativeFix[] } | { type: "resumed" };

interface FlutterWindow {
  flutter_inappwebview?: { callHandler: (name: string, ...args: unknown[]) => Promise<unknown> };
  /** set by the app before the page loads */
  __RMT_APP__?: { version: string; platform: string };
  __rmtReceive?: (msg: Incoming) => void;
}

const w = window as unknown as FlutterWindow;

/** True when running inside the Record My Trip app. */
export const isInApp = (): boolean => !!w.__RMT_APP__;

/** Resolves once the app's message handler can be called. */
function ready(): Promise<boolean> {
  if (!isInApp()) return Promise.resolve(false);
  if (w.flutter_inappwebview?.callHandler) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => resolve(!!w.flutter_inappwebview?.callHandler);
    window.addEventListener("flutterInAppWebViewPlatformReady", done, { once: true });
    setTimeout(done, 5000);
  });
}

export async function callApp<T = unknown>(msg: AppMessage): Promise<T | null> {
  if (!(await ready())) return null;
  try {
    return ((await w.flutter_inappwebview!.callHandler("rmt", msg)) ?? null) as T | null;
  } catch {
    return null;
  }
}

const listeners = new Set<(msg: Incoming) => void>();
if (isInApp()) {
  w.__rmtReceive = (msg) => listeners.forEach((l) => l(msg));
}

export function onAppMessage(listener: (msg: Incoming) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Share sheet: the app's native one (WebViews have no navigator.share). */
export async function shareLink(title: string, text: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
  if (isInApp()) {
    await callApp({ type: "shareText", title, text, url });
    return "shared";
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

/** Hands a file to the person: the app's share sheet (save to Files, Drive, send…), else a download. */
export async function saveTextFile(name: string, mime: string, text: string): Promise<void> {
  if (isInApp()) {
    await callApp({ type: "saveFile", name, mime, text });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
