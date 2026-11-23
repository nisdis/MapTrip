import { useEffect, useState } from "react";
import { Check, Copy, Radio, Share2, X } from "lucide-react";
import { AuthForm } from "./AuthForm";
import type { AuthMode } from "../hooks/useAuth";
import type { ActiveShare } from "../hooks/useLiveShare";
import type { ShareDuration } from "../services/liveShare";
import { isInApp, shareLink } from "../services/appBridge";

interface LiveShareSheetProps {
  signedIn: boolean;
  share: ActiveShare | null;
  lastSyncAt: number | null;
  problem: string | null;
  onAuthenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
  onStart: (duration: ShareDuration) => Promise<void>;
  onExtend: () => Promise<void>;
  onStop: () => Promise<void>;
  onClose: () => void;
}

const DURATIONS: { id: ShareDuration; label: string }[] = [
  { id: "1h", label: "1 hour" },
  { id: "8h", label: "8 hours" },
  { id: "trip", label: "Until trip ends" },
];

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

const btn =
  "flex h-12 items-center justify-center gap-2 rounded-xl font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt disabled:opacity-50";

/** Start, manage and stop a live link for the trip being recorded. */
export function LiveShareSheet(props: LiveShareSheetProps) {
  const { share } = props;
  const [duration, setDuration] = useState<ShareDuration>("trip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const now = useNow(5000);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!share) return;
    try {
      const result = await shareLink("Live trip", "Follow my trip live", share.url);
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setError("Couldn't share. Press and hold the link to copy it.");
    }
  };

  const syncAge = props.lastSyncAt ? Math.max(0, Math.round((now - props.lastSyncAt) / 1000)) : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-asphalt/40" onClick={props.onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Share live location"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-[22px] bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-asphalt font-hud shadow-[0_-10px_36px_rgba(31,42,48,0.22)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Radio aria-hidden className="h-5 w-5 text-signal" />
            {share ? "Sharing live" : "Share live location"}
          </h2>
          <button type="button" onClick={props.onClose} aria-label="Close" className="rounded-full p-2 hover:bg-asphalt/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!props.signedIn ? (
          <div className="mt-3">
            <AuthForm
              reason="to share this trip live."
              onAuthenticate={props.onAuthenticate}
              onSuccess={() => undefined}
              onCancel={props.onClose}
            />
          </div>
        ) : !share ? (
          <>
            <p className="mt-2 text-sm text-asphalt/75">
              Anyone with the link sees your route, position, speed and stats until sharing ends. The first 300 m from
              where you started are never shown.
            </p>
            <fieldset className="mt-3">
              <legend className="text-xs text-asphalt/60">Share for</legend>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={duration === d.id}
                    onClick={() => setDuration(d.id)}
                    className={`rounded-xl border-2 px-2 py-3 text-sm font-bold ${
                      duration === d.id ? "border-asphalt bg-asphalt text-white" : "border-asphalt/20"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-asphalt/55">
                It always stops when you finish the trip, and after 24 hours at most.
              </p>
            </fieldset>
            <p className={`mt-3 rounded-lg bg-milestone/25 px-3 py-2 text-xs ${isInApp() ? "hidden" : ""}`}>
              Keep this page open with the screen on. Phones pause web pages when locked, so viewers stop getting
              updates until you unlock.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => props.onStart(duration))}
              className={`${btn} mt-3 w-full bg-signal text-white`}
            >
              <Radio aria-hidden className="h-5 w-5" />
              {busy ? "Starting…" : "Start sharing"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-asphalt/75" role="status">
              Ends at {clock(share.expiresAt)} or when you finish the trip.{" "}
              {props.problem ? (
                <span className="text-[#9a6700]">{props.problem}</span>
              ) : syncAge == null ? (
                "Sending…"
              ) : (
                `Last sent ${syncAge < 5 ? "just now" : `${syncAge} s ago`}.`
              )}
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-asphalt/15 bg-white px-3 py-2">
              <input
                readOnly
                aria-label="Live link"
                value={share.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(share.url).then(() => setCopied(true))}
                aria-label="Copy link"
                className="rounded-lg p-2 hover:bg-asphalt/10"
              >
                {copied ? <Check className="h-4 w-4 text-highway" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={sendLink} className={`${btn} col-span-2 bg-highway text-white`}>
                <Share2 aria-hidden className="h-5 w-5" /> Send link
              </button>
              <button
                type="button"
                disabled={busy || share.atLimit}
                onClick={() => run(props.onExtend)}
                className={`${btn} border-2 border-asphalt`}
                title={share.atLimit ? "Live links last 24 hours at most" : undefined}
              >
                +1 hour
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(props.onStop)}
                className={`${btn} border-2 border-signal text-signal`}
              >
                Stop sharing
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-signal">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
