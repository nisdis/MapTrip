import { useEffect, useState } from "react";
import { ChevronDown, Globe, MapPin, Navigation, Phone, X } from "lucide-react";
import type { PlaceDetails } from "../services/placeService";
import { describeHours, type HoursInfo } from "../utils/openingHours";
import { useReportHeight } from "../hooks/useReportHeight";

interface PlaceCardProps {
  status: "loading" | "ready" | "error";
  coords: { lat: number; lng: number };
  place: PlaceDetails | null;
  error: string | null;
  onClose: () => void;
  onDirections: () => void;
  onHeight: (px: number) => void;
}

const STATE_STYLE = {
  open: { dot: "bg-highway", text: "text-highway" },
  closed: { dot: "bg-signal", text: "text-signal" },
  unknown: { dot: "bg-asphalt/40", text: "text-asphalt/70" },
} as const;

function Hours({ place }: { place: PlaceDetails }) {
  const raw = place.openingHours;
  const [info, setInfo] = useState<HoursInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setInfo(null);
    setFailed(false);
    setExpanded(false);
    if (!raw) return;
    let cancelled = false;
    describeHours(raw, {
      lat: place.lat,
      lng: place.lng,
      countryCode: place.countryCode ?? undefined,
    })
      .then((result) => {
        if (cancelled) return;
        if (result) setInfo(result);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [raw, place.lat, place.lng, place.countryCode]);

  if (!raw) {
    return (
      <p className="text-sm text-asphalt/60">
        Hours not listed
        {place.osmUrl && (
          <>
            {". "}
            <a
              href={place.osmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Add them on OpenStreetMap
            </a>
          </>
        )}
      </p>
    );
  }
  if (failed) {
    // The value couldn't be parsed: show it as written rather than guess.
    return <p className="text-sm text-asphalt/80">Hours: {raw}</p>;
  }
  if (!info) return <div className="h-5 w-48 rounded bg-asphalt/10 motion-safe:animate-pulse" />;

  const style = STATE_STYLE[info.state];
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
      >
        <span aria-hidden className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${style.dot}`} />
        <span className={`flex-1 text-sm font-bold ${style.text}`}>{info.summary}</span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 text-asphalt/60 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        <span className="sr-only">{expanded ? "Hide weekly hours" : "Show weekly hours"}</span>
      </button>
      {expanded && (
        <dl className="mt-2 divide-y divide-asphalt/10 border-y border-asphalt/10 text-sm">
          {info.week.map((d) => (
            <div key={d.day} className={`flex justify-between gap-4 py-1.5 ${d.isToday ? "font-bold" : ""}`}>
              <dt>{d.day}</dt>
              <dd className="text-right tabular-nums">{d.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function PlaceCard({ status, coords, place, error, onClose, onDirections, onHeight }: PlaceCardProps) {
  const ref = useReportHeight(onHeight);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = place?.name ?? (status === "loading" ? "Looking up this place…" : "Dropped pin");
  const subtitle = [place?.category, place?.cuisine].filter(Boolean).join(" · ");
  const phoneHref = place?.phone ? `tel:${place.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <section
      ref={ref}
      role="dialog"
      aria-label="Place details"
      className="fixed left-3 right-3 bottom-[5.75rem] z-30 rounded-2xl bg-paper p-4 font-hud text-asphalt shadow-[0_8px_32px_rgba(31,42,48,0.28)] md:left-auto md:right-4 md:w-96"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-snug">{title}</h2>
          {subtitle && <p className="text-sm text-asphalt/70">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close place details"
          className="-mr-1 -mt-1 rounded-full p-2 hover:bg-asphalt/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 space-y-2.5" aria-live="polite">
        {status === "loading" && (
          <div role="status" className="space-y-2">
            <div className="h-4 w-56 rounded bg-asphalt/10 motion-safe:animate-pulse" />
            <div className="h-4 w-40 rounded bg-asphalt/10 motion-safe:animate-pulse" />
          </div>
        )}

        {status === "error" && <p className="text-sm text-signal">{error}</p>}

        {status === "ready" && place && (
          <>
            {place.name && <Hours place={place} />}
            <p className="flex gap-2 text-sm">
              <MapPin aria-hidden className="mt-0.5 h-4 w-4 flex-shrink-0 text-asphalt/60" />
              <span>{place.address ?? "No address found here"}</span>
            </p>
            {(phoneHref || place.website) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                {phoneHref && (
                  <a href={phoneHref} className="flex items-center gap-1.5 underline underline-offset-2">
                    <Phone aria-hidden className="h-4 w-4" />
                    {place.phone}
                  </a>
                )}
                {place.website && (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 underline underline-offset-2"
                  >
                    <Globe aria-hidden className="h-4 w-4" />
                    Website
                  </a>
                )}
              </div>
            )}
            {place.features.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {place.features.map((f) => (
                  <li key={f} className="rounded-full border border-asphalt/20 px-2.5 py-0.5 text-xs">
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {status !== "ready" && (
          <p className="text-xs text-asphalt/60 tabular-nums">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onDirections}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-highway font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
      >
        <Navigation className="h-4 w-4" /> Directions
      </button>
      {status === "ready" && place?.name && (
        <p className="mt-2 text-xs text-asphalt/50">Details from OpenStreetMap contributors</p>
      )}
    </section>
  );
}
