import { useEffect, useMemo, useState } from "react";
import { MapContainer } from "react-leaflet";
import { Flag, Route, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { VectorBasemap } from "../components/VectorBasemap";
import { TripLayer } from "../components/TripLayer";
import { AuthForm } from "../components/AuthForm";
import { useAuth } from "../hooks/useAuth";
import type { TrackPoint } from "../types/trip";
import {
  REPORT_REASONS,
  countView,
  getPublicTrip,
  reportTrip,
  sharedPhotoUrl,
  type PublicTrip,
} from "../services/publicTrips";
import { formatClock, formatKm, formatSpeedKmh } from "../utils/tripStats";

const toTrack = (pts: PublicTrip["points"]): TrackPoint[] =>
  pts.map(([lat, lng, t, speed, gap]) => ({ lat, lng, t, speed, ...(gap ? { gap: true } : {}) }));

function ReportSheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const auth = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!reason) return;
    setState("sending");
    setError(null);
    try {
      await reportTrip(tripId, reason, details.trim());
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the report");
      setState("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end bg-black/50" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Report this trip"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-[22px] bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-asphalt"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Report this trip</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-asphalt/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        {state === "sent" ? (
          <p role="status" className="mt-3 text-sm">
            Thanks. It will be reviewed. Trips reported by several people are taken out of Explore straight away.
          </p>
        ) : !auth.user ? (
          <div className="mt-3">
            <AuthForm reason="to report this trip." onAuthenticate={auth.authenticate} onSuccess={() => undefined} onCancel={onClose} />
          </div>
        ) : (
          <>
            <fieldset className="mt-3 space-y-1.5">
              <legend className="text-xs text-asphalt/60">What's wrong?</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.id} className="flex items-center gap-2 rounded-lg border border-asphalt/15 px-3 py-2.5 text-sm">
                  <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              placeholder="Anything else we should know (optional)"
              className="mt-3 h-20 w-full rounded-lg border border-asphalt/20 bg-white px-3 py-2 text-base"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-signal">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={!reason || state === "sending"}
              onClick={send}
              className="mt-3 h-12 w-full rounded-xl bg-signal font-bold text-white disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Send report"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function NotShared() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6 font-hud text-asphalt">
      <div className="max-w-sm text-center">
        <Route aria-hidden className="mx-auto h-10 w-10 text-asphalt/40" />
        <h1 className="mt-3 text-xl font-bold">This trip isn't shared</h1>
        <p className="mt-2 text-sm text-asphalt/70">It may be private, or the link may be wrong.</p>
        <a href="/" className="mt-5 inline-block rounded-xl bg-asphalt px-5 py-3 text-sm font-bold text-paper">
          Open Map Trip
        </a>
      </div>
    </main>
  );
}

/** A shared trip at /t/<id>: route without its start and end, stats, chosen photos. */
export default function TripViewer({ id }: { id: string }) {
  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [missing, setMissing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicTrip(id)
      .then((t) => {
        if (cancelled) return;
        setTrip(t);
        document.title = `${t.title} · Map Trip`;
        void countView(id);
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const track = useMemo(() => (trip ? toTrack(trip.points) : []), [trip]);

  if (missing) return <NotShared />;

  const s = trip?.stats;
  // An average above the top speed means the times don't add up: don't show nonsense.
  const avg = s && s.durationS > 0 ? s.distanceM / s.durationS : 0;
  const avgOk = !!s && avg > 0 && (s.maxSpeedMs === 0 || avg <= s.maxSpeedMs * 1.05);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper font-hud text-asphalt">
      <MapContainer center={[20, 78]} zoom={4} className="h-full w-full" zoomControl={false} minZoom={2}>
        <VectorBasemap />
        <TripLayer track={track} fitKey={track.length > 1 ? "trip" : null} bottomInset={260} />
      </MapContainer>

      <section
        aria-label="Trip"
        className="absolute inset-x-0 bottom-0 z-[1000] max-h-[60vh] overflow-y-auto rounded-t-[22px] bg-paper px-4 pt-3 shadow-[0_-10px_36px_rgba(31,42,48,0.22)] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {!trip ? (
          <p className="py-4 text-sm text-asphalt/60">Loading trip…</p>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold">{trip.title}</h1>
                {trip.imported && (
                  <span className="mt-0.5 inline-block rounded bg-asphalt/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-asphalt/70" title="Imported from a GPX file, not recorded live in the app">
                    Imported
                  </span>
                )}
                <p className="text-sm text-asphalt/65">
                  {trip.author ? `by ${trip.author} · ` : ""}
                  {new Date(`${trip.stats.date}T12:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-asphalt/60 hover:bg-asphalt/10"
              >
                <Flag aria-hidden className="h-3.5 w-3.5" /> Report
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 border-y border-asphalt/15 text-center">
              {[
                ["Distance", formatKm(trip.stats.distanceM), "km"],
                ["Time", formatClock(trip.stats.durationS), ""],
                ["Average", avgOk ? formatSpeedKmh(avg) : "–", avgOk ? "km/h" : ""],
                ["Max", formatSpeedKmh(trip.stats.maxSpeedMs), "km/h"],
              ].map(([label, value, unit]) => (
                <div key={label} className="py-2">
                  <div className="text-[11px] text-asphalt/60">{label}</div>
                  <div className="text-lg font-bold tabular-nums">
                    {value}
                    {unit && <span className="ml-0.5 text-[11px] font-normal text-asphalt/60">{unit}</span>}
                  </div>
                </div>
              ))}
            </div>
            {trip.photos.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Photos">
                {trip.photos.map((p) => (
                  <button key={p} type="button" onClick={() => setPhoto(p)} className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-asphalt/10">
                    <img src={sharedPhotoUrl(trip.id, p)} alt="Trip photo" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-asphalt/50">
              {trip.hideM > 0
                ? `The first and last ${trip.hideM >= 1000 ? `${trip.hideM / 1000} km` : `${trip.hideM} m`} aren't shown.`
                : "Shown in full by its owner."}
            </p>
            <a href="/" className="mt-2 mb-1 inline-block text-sm font-bold text-highway underline">
              Open Map Trip
            </a>
          </>
        )}
      </section>

      {photo && trip && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/90" onClick={() => setPhoto(null)}>
          <img src={sharedPhotoUrl(trip.id, photo)} alt="Trip photo" className="max-h-full max-w-full object-contain" />
          <button type="button" aria-label="Close photo" className="absolute right-3 top-3 rounded-full bg-white/20 p-2 text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
      {reporting && trip && <ReportSheet tripId={trip.id} onClose={() => setReporting(false)} />}
    </div>
  );
}
