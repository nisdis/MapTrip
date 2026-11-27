import { useEffect, useState } from "react";
import { Check, Copy, Globe2, Link2, Lock, Share2, AlertTriangle, X } from "lucide-react";
import type { Trip, TripPhoto } from "../types/trip";
import { usePhotoUrl } from "../services/photoStore";
import { shareLink } from "../services/appBridge";
import {
  HIDE_OPTIONS,
  PublicError,
  getMe,
  getShareSettings,
  saveShareSettings,
  setDisplayName,
  tripUrl,
  type ShareSettings,
  type Visibility,
} from "../services/publicTrips";

interface TripShareSheetProps {
  trip: Trip;
  onClose: () => void;
}

const VIS: { id: Visibility; label: string; note: string; Icon: typeof Lock }[] = [
  { id: "private", label: "Private", note: "Only you", Icon: Lock },
  { id: "unlisted", label: "Unlisted", note: "Anyone with the link", Icon: Link2 },
  { id: "public", label: "Public", note: "Link, and in Explore", Icon: Globe2 },
];

const hideLabel = (m: number) => (m === 0 ? "Off" : m >= 1000 ? `${m / 1000} km` : `${m} m`);

function LocalPhoto({ photo, ticked, onToggle }: { photo: TripPhoto; ticked: boolean; onToggle: () => void }) {
  const url = usePhotoUrl(photo);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ticked}
      aria-label={ticked ? "Shown on the shared trip" : "Not shown"}
      onClick={onToggle}
      className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 bg-asphalt/10 ${
        ticked ? "border-highway" : "border-transparent opacity-60"
      }`}
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <span
        className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${
          ticked ? "bg-highway" : "bg-asphalt/40"
        }`}
      >
        {ticked && <Check className="h-3 w-3 text-white" />}
      </span>
    </button>
  );
}

/**
 * Who can see a saved trip: private (default), unlisted, or public (Explore).
 * The start and end are hidden (500 m unless the owner changes it), and only
 * the photos the owner ticks are shown.
 */
export function TripShareSheet({ trip, onClose }: TripShareSheetProps) {
  const [loaded, setLoaded] = useState<ShareSettings | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [hideM, setHideM] = useState(500);
  const [photos, setPhotos] = useState<string[]>([]);
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Photos only: videos stay private for now.
  const cloudPhotos = (trip.photos ?? []).filter((p) => p.cloudPath && p.kind !== "video");
  const url = tripUrl(trip.id);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getShareSettings(trip.id), getMe()])
      .then(([s, me]) => {
        if (cancelled) return;
        setLoaded(s);
        setVisibility(s.visibility);
        setHideM(s.hideM);
        setPhotos(s.photos);
        setNeedsName(!me.displayName);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load sharing"));
    return () => {
      cancelled = true;
    };
  }, [trip.id]);

  const changed =
    !!loaded &&
    (loaded.visibility !== visibility ||
      loaded.hideM !== hideM ||
      loaded.photos.length !== photos.length ||
      loaded.photos.some((p) => !photos.includes(p)));
  const sharing = visibility !== "private";

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (sharing && needsName) {
        await setDisplayName(name.trim());
        setNeedsName(false);
      }
      const s = await saveShareSettings(trip.id, { visibility, hideM, photos });
      setLoaded({ ...loaded, ...s });
      if (s.visibility !== "private" && (s.visiblePoints ?? 0) < 2) {
        setNotice("This trip is shorter than the hidden start and end, so there's no route to show. Hide less, or keep it private.");
      } else {
        setNotice(s.visibility === "private" ? "Only you can see this trip." : "Saved. Share the link below.");
      }
    } catch (e) {
      if (e instanceof PublicError && e.body.needsName) setNeedsName(true);
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    try {
      const r = await shareLink(trip.name, `My trip: ${trip.name}`, url);
      if (r === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setError("Couldn't share. Copy the link instead.");
    }
  };

  const savedSharing = loaded && loaded.visibility !== "private" && !changed;

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/50" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Share trip"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] font-hud text-asphalt shadow-[0_-10px_36px_rgba(31,42,48,0.22)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="truncate text-lg font-bold">Share “{trip.name}”</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-asphalt/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!loaded && !error && <p className="mt-3 text-sm text-asphalt/60">Loading…</p>}

        {loaded && (
          <>
            <fieldset className="mt-3">
              <legend className="text-xs text-asphalt/60">Who can see it</legend>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {VIS.map(({ id, label, note, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={visibility === id}
                    onClick={() => setVisibility(id)}
                    className={`rounded-xl border-2 px-2 py-2 text-left ${
                      visibility === id ? "border-asphalt bg-asphalt text-paper" : "border-asphalt/20"
                    }`}
                  >
                    <Icon aria-hidden className="h-4 w-4" />
                    <div className="mt-1 text-sm font-bold">{label}</div>
                    <div className={`text-[11px] ${visibility === id ? "text-paper/80" : "text-asphalt/60"}`}>{note}</div>
                  </button>
                ))}
              </div>
              {loaded.hiddenFromExplore && visibility === "public" && (
                <p className="mt-2 text-xs font-bold text-[#9a6700]">
                  Reported by several people: it's out of Explore until it has been reviewed. The link still works.
                </p>
              )}
            </fieldset>

            {sharing && (
              <>
                <fieldset className="mt-4">
                  <legend className="text-xs text-asphalt/60">Hide the start and end</legend>
                  <div className="mt-1 grid grid-cols-4 gap-2">
                    {HIDE_OPTIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={hideM === m}
                        onClick={() => setHideM(m)}
                        className={`rounded-xl border-2 py-2 text-sm font-bold ${
                          hideM === m ? "border-asphalt bg-asphalt text-paper" : "border-asphalt/20"
                        }`}
                      >
                        {hideLabel(m)}
                      </button>
                    ))}
                  </div>
                  {hideM === 0 ? (
                    <p role="alert" className="mt-2 flex gap-2 rounded-lg bg-signal/10 px-3 py-2 text-xs font-bold text-signal">
                      <AlertTriangle aria-hidden className="h-4 w-4 flex-shrink-0" />
                      Viewers will see exactly where this trip started and ended. If that's your home or work, hide it.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-asphalt/55">
                      Nothing within {hideLabel(hideM)} of where the trip started or ended is shown.
                    </p>
                  )}
                </fieldset>

                {cloudPhotos.length > 0 && (
                  <fieldset className="mt-4">
                    <legend className="text-xs text-asphalt/60">Photos to show (none unless you tick them)</legend>
                    <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                      {cloudPhotos.map((p) => (
                        <LocalPhoto
                          key={p.id}
                          photo={p}
                          ticked={photos.includes(p.id)}
                          onToggle={() => setPhotos((ps) => (ps.includes(p.id) ? ps.filter((x) => x !== p.id) : [...ps, p.id]))}
                        />
                      ))}
                    </div>
                  </fieldset>
                )}
                {(trip.photos ?? []).length > cloudPhotos.length && (
                  <p className="mt-1 text-xs text-asphalt/55">Photos not yet saved to the cloud can't be shared. Use Update cloud copy first.</p>
                )}

                {needsName && (
                  <label className="mt-4 block">
                    <span className="text-xs text-asphalt/60">Your public name (shown on shared trips)</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={40}
                      placeholder="e.g. Nissim D"
                      className="mt-1 w-full rounded-xl border border-asphalt/20 bg-white px-3 py-2.5 text-base"
                    />
                    <span className="text-[11px] text-asphalt/55">Not your email. You can change it later.</span>
                  </label>
                )}
              </>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-signal">
                {error}
              </p>
            )}
            {notice && !error && (
              <p role="status" className="mt-3 text-sm text-highway">
                {notice}
              </p>
            )}

            {(changed || (sharing && needsName)) && (
              <button
                type="button"
                disabled={busy || (sharing && needsName && name.trim().length < 2)}
                onClick={save}
                className="mt-4 h-12 w-full rounded-xl bg-highway font-bold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : visibility === "private" ? "Make private" : "Save and get link"}
              </button>
            )}

            {savedSharing && (
              <div className="mt-4">
                <div className="flex items-center gap-2 rounded-xl border-2 border-asphalt/15 bg-white px-3 py-2">
                  <input readOnly aria-label="Trip link" value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent text-sm" />
                  <button
                    type="button"
                    aria-label="Copy link"
                    onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
                    className="rounded-lg p-2 hover:bg-asphalt/10"
                  >
                    {copied ? <Check className="h-4 w-4 text-highway" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <button type="button" onClick={send} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-asphalt font-bold">
                  <Share2 aria-hidden className="h-5 w-5" /> Send link
                </button>
                {typeof loaded.views === "number" && loaded.views > 0 && (
                  <p className="mt-2 text-center text-xs text-asphalt/55">{loaded.views} views</p>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
