import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { Crosshair, Radio } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { VectorBasemap } from "../components/VectorBasemap";
import { TripLayer } from "../components/TripLayer";
import type { TrackPoint } from "../types/trip";
import { fetchLiveView, type LivePoint, type LiveView } from "../services/liveShare";
import { formatClock, formatKm, formatSpeedKmh } from "../utils/tripStats";

/** Same pace as the sharer's uploads. */
const POLL_MS = 20_000;
/** No upload for this long while "recording": their page is probably paused (locked phone). */
const STALE_MS = 90_000;

type Live = Extract<LiveView, { state: "live" }>;

const toTrack = (pts: LivePoint[]): TrackPoint[] =>
  pts.map(([lat, lng, t, speed, gap]) => ({ lat, lng, t, speed, ...(gap ? { gap: true } : {}) }));

const dotIcon = (stale: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;width:22px;height:22px">
      ${stale ? "" : '<div class="animate-ping" style="position:absolute;inset:0;border-radius:9999px;background:rgba(215,38,61,.35)"></div>'}
      <div style="position:absolute;inset:3px;border-radius:9999px;background:${stale ? "#5B6670" : "#D7263D"};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

/** Follows the live position until the viewer moves the map themselves. */
function Follow({ to, follow, onUserMove }: { to: [number, number] | null; follow: boolean; onUserMove: () => void }) {
  const map = useMap();
  useEffect(() => {
    const stop = () => onUserMove();
    map.on("dragstart", stop);
    return () => {
      map.off("dragstart", stop);
    };
  }, [map, onUserMove]);
  useEffect(() => {
    if (!follow || !to) return;
    // Zoom in the first time (the map starts zoomed out until there's a position).
    if (map.getZoom() < 12) map.setView(to, 15);
    else map.panTo(to, { animate: true });
  }, [map, to, follow]);
  return null;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[11px] text-asphalt/60">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-asphalt/60">{unit}</span>}
      </div>
    </div>
  );
}

function EndedCard({ state }: { state: "missing" | "ended" | "expired" }) {
  const title =
    state === "ended" ? "This trip has ended" : state === "expired" ? "This live link has expired" : "Live link not found";
  const body =
    state === "missing"
      ? "The link may be mistyped, or sharing ended more than a day ago."
      : "Live sharing has stopped, and the route is no longer shown.";
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6 font-hud text-asphalt">
      <div className="max-w-sm text-center">
        <Radio aria-hidden className="mx-auto h-10 w-10 text-asphalt/40" />
        <h1 className="mt-3 text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-asphalt/70">{body}</p>
        <a href="/" className="mt-5 inline-block rounded-xl bg-asphalt px-5 py-3 text-sm font-bold text-paper">
          Open Map Trip
        </a>
      </div>
    </main>
  );
}

export default function LiveViewer({ token }: { token: string }) {
  const [view, setView] = useState<Live | null>(null);
  const [ended, setEnded] = useState<"missing" | "ended" | "expired" | null>(null);
  const [trail, setTrail] = useState<LivePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const copy = useRef({ total: 0, rev: 0 });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const v = await fetchLiveView(token, copy.current.total, copy.current.rev, signal);
        if (v.state !== "live") {
          setEnded(v.state);
          setView(null);
          setTrail([]);
          return;
        }
        // Either the new points only, or (copy out of date) the whole trail.
        setTrail((t) => (v.from === 0 ? v.points : [...t.slice(0, v.from), ...v.points]));
        copy.current = { total: v.total, rev: v.rev };
        setView(v);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Can't reach Map Trip. Retrying…");
      }
    },
    [token],
  );

  useEffect(() => {
    if (ended) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    const id = setInterval(() => void load(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ctrl.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, ended]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = "Live trip · Map Trip";
  }, []);

  const track = useMemo(() => toTrack(trail), [trail]);
  const lat = view?.current?.lat;
  const lng = view?.current?.lng;
  const current = useMemo<[number, number] | null>(() => (lat != null && lng != null ? [lat, lng] : null), [lat, lng]);
  const onUserMove = useCallback(() => setFollow(false), []);

  if (ended) return <EndedCard state={ended} />;

  const age = view ? now - view.updatedAt : 0;
  const stale = !!view && view.status === "recording" && age > STALE_MS;
  const paused = view?.status === "paused";
  // Time keeps running between updates while they're recording.
  const seconds = view ? view.stats.activeSeconds + (view.status === "recording" && !stale ? Math.floor(age / 1000) : 0) : 0;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper font-hud text-asphalt">
      <MapContainer
        center={current ?? [20, 78]}
        zoom={current ? 15 : 4}
        className="h-full w-full"
        zoomControl={false}
        minZoom={2}
      >
        <VectorBasemap />
        <TripLayer track={track} fitKey={track.length > 1 ? "first" : null} bottomInset={220} />
        {current && <Marker position={current} icon={dotIcon(stale || paused)} />}
        <Follow to={current} follow={follow} onUserMove={onUserMove} />
      </MapContainer>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex justify-center p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-paper/95 px-4 py-2 text-sm shadow-lg" role="status">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full ${
              !view ? "bg-asphalt/30" : stale || paused ? "bg-asphalt/50" : "bg-signal motion-safe:animate-pulse"
            }`}
          />
          <span className="font-bold">{!view ? "Connecting…" : paused ? "Paused" : stale ? "No signal" : "Live"}</span>
          {view && <span className="text-asphalt/60">· updated {ago(age)}</span>}
        </div>
      </header>

      {!follow && current && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute right-3 top-16 z-[1000] flex items-center gap-1.5 rounded-full bg-asphalt px-4 py-2 text-sm font-bold text-paper shadow-lg"
        >
          <Crosshair aria-hidden className="h-4 w-4" /> Follow
        </button>
      )}

      <section
        aria-label="Trip stats"
        className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-[22px] bg-paper shadow-[0_-10px_36px_rgba(31,42,48,0.22)] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="px-4 pt-3">
          {error && <p className="text-xs font-bold text-signal">{error}</p>}
          {stale && (
            <p className="text-xs font-bold text-[#9a6700]">
              No update for {ago(age).replace(" ago", "")}. Their phone may be locked or offline.
            </p>
          )}
          {view?.nearStart && (
            <p className="text-xs text-asphalt/70">Near where the trip started. The exact position is hidden for privacy.</p>
          )}
          <div className="mt-1 flex items-baseline">
            <span className="text-5xl font-bold leading-none tabular-nums">
              {view && !stale && !paused ? formatSpeedKmh(view.stats.speedMs) : "–"}
            </span>
            <span className="ml-2 text-base text-asphalt/70">km/h</span>
            <span className="ml-auto text-xs text-asphalt/55">
              {view ? `Ends ${new Date(view.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
            </span>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 border-t border-asphalt/15">
          <Stat label="Distance" value={view ? formatKm(view.stats.distanceM + view.stats.estimatedM) : "–"} unit="km" />
          <Stat label="Time" value={view ? formatClock(seconds) : "–"} />
          <Stat label="Max" value={view ? formatSpeedKmh(view.stats.maxSpeedMs) : "–"} unit="km/h" />
          <Stat
            label="Altitude"
            value={view?.stats.altitudeM == null ? "–" : String(Math.round(view.stats.altitudeM))}
            unit={view?.stats.altitudeM == null ? undefined : "m"}
          />
        </div>
      </section>
    </div>
  );
}
