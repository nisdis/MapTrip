import { useEffect, useRef, useState } from "react";
import {
  Accessibility,
  Car,
  ChevronDown,
  ChevronLeft,
  Clock,
  Globe,
  Info,
  Link2,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Share2,
  Star,
  Home as House,
  Briefcase,
  X,
} from "lucide-react";
import type { PlaceDetails } from "../services/placeService";
import { describeHours, type HoursInfo } from "../utils/openingHours";
import { fetchWikiSummary, type WikiSummary } from "../services/wikiService";
import { driveEstimate, formatDriveTime, type DriveEstimate } from "../services/routeService";
import { useReportHeight } from "../hooks/useReportHeight";
import { haversine } from "../utils/geo";

export interface PlaceSavedState {
  isFavourite: boolean;
  isHome: boolean;
  isWork: boolean;
  note: string | null;
  onToggleFavourite: () => void;
  onToggleHome: () => void;
  onToggleWork: () => void;
  onSaveNote: (note: string) => void;
}

interface PlaceSheetProps {
  saved: PlaceSavedState;
  status: "loading" | "ready" | "error";
  coords: { lat: number; lng: number };
  place: PlaceDetails | null;
  error: string | null;
  userPosition: [number, number] | null;
  /** e.g. "Cafes": shown as a back link when opened from a list */
  backLabel?: string;
  onBack?: () => void;
  onClose: () => void;
  onDirections: () => void;
  onHeight: (px: number) => void;
}

const STATE_STYLE = {
  open: { dot: "bg-highway", text: "text-highway" },
  closed: { dot: "bg-signal", text: "text-signal" },
  unknown: { dot: "bg-asphalt/40", text: "text-asphalt/70" },
} as const;

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt";

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

function useHours(place: PlaceDetails | null) {
  const raw = place?.openingHours ?? null;
  const [info, setInfo] = useState<HoursInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setInfo(null);
    setFailed(false);
    if (!raw || !place) return;
    let cancelled = false;
    describeHours(raw, { lat: place.lat, lng: place.lng, countryCode: place.countryCode ?? undefined })
      .then((r) => !cancelled && (r ? setInfo(r) : setFailed(true)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [raw, place]);
  return { raw, info, failed };
}

function Row({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <Icon aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0 text-asphalt/60" />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  href,
  onClick,
  primary = false,
  pressed,
}: {
  icon: typeof MapPin;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  /** For toggle buttons like Save */
  pressed?: boolean;
}) {
  const cls = `flex h-10 flex-shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold ${focusRing} ${
    primary ? "bg-highway text-white" : "border border-asphalt/25 text-asphalt"
  }`;
  const content = (
    <>
      <Icon aria-hidden className="h-4 w-4" />
      {label}
    </>
  );
  return href ? (
    <a href={href} className={cls} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={cls}>
      {content}
    </button>
  );
}

export function PlaceSheet(props: PlaceSheetProps) {
  const { status, coords, place, error, userPosition, onClose, onDirections, saved } = props;
  const [noteDraft, setNoteDraft] = useState(saved.note ?? "");
  useEffect(() => setNoteDraft(saved.note ?? ""), [saved.note, place?.id]);
  // Save the note shortly after typing stops, not only when the box loses focus
  // (leaving the page or locking the phone would otherwise lose it).
  const saveNote = saved.onSaveNote;
  const currentNote = saved.note ?? "";
  useEffect(() => {
    if (noteDraft === currentNote) return;
    const t = setTimeout(() => saveNote(noteDraft), 800);
    return () => clearTimeout(t);
  }, [noteDraft, currentNote, saveNote]);
  const ref = useReportHeight(props.onHeight);
  const [expanded, setExpanded] = useState(false);
  const [wiki, setWiki] = useState<WikiSummary | null>(null);
  const [drive, setDrive] = useState<DriveEstimate | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hours = useHours(status === "ready" ? place : null);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

  // A new place starts collapsed.
  useEffect(() => setExpanded(false), [place?.id, coords.lat, coords.lng]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Photo and description for notable places.
  useEffect(() => {
    setWiki(null);
    if (!place?.name) return;
    let cancelled = false;
    fetchWikiSummary(place.wikipedia, place.wikidata, {
      name: place.name,
      lat: place.lat,
      lng: place.lng,
    }).then((w) => !cancelled && setWiki(w));
    return () => {
      cancelled = true;
    };
  }, [place?.wikipedia, place?.wikidata, place?.name, place?.lat, place?.lng]);

  // Drive time from you (only once the place is known, one request per place).
  const target = place ? { lat: place.lat, lng: place.lng } : coords;
  const straightLine = userPosition ? haversine({ lat: userPosition[0], lng: userPosition[1] }, target) : null;
  useEffect(() => {
    setDrive(null);
    if (status !== "ready" || !userPosition || straightLine == null || straightLine < 50) return;
    const ctrl = new AbortController();
    driveEstimate({ lat: userPosition[0], lng: userPosition[1] }, target, ctrl.signal).then(
      (d) => !ctrl.signal.aborted && setDrive(d),
    );
    return () => ctrl.abort();
    // Recompute per place, not on every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, place?.id, coords.lat, coords.lng, userPosition !== null]);

  const share = async () => {
    // Exact place when we know its OpenStreetMap id; a pin link otherwise.
    const osm = place && /^(node|way|relation)\/\d+$/.test(place.id) ? place.id : null;
    const path = osm ?? `pin/${target.lat.toFixed(6)},${target.lng.toFixed(6)}`;
    const nameParam = place?.name ? `?n=${encodeURIComponent(place.name.slice(0, 80))}` : "";
    const url = `${window.location.origin}/p/${path}${nameParam}`;
    const title = place?.name ?? "Dropped pin";
    try {
      if (navigator.share) {
        await navigator.share({ title, text: [title, place?.address].filter(Boolean).join(", "), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("Link copied");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user cancelled the share sheet
      setToast("Couldn't share this place");
    }
    setTimeout(() => setToast(null), 2000);
  };

  const title = place?.name ?? (status === "loading" ? "Looking up this place…" : "Dropped pin");
  const subtitle = [place?.category, place?.cuisine].filter(Boolean).join(" · ");
  const phone = place?.phones[0];
  const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;
  // Every known place has more to show (at least Home/Work and its address).
  const hasMore = status === "ready" && !!place;

  const hoursLine = (() => {
    if (status !== "ready" || !place?.name) return null;
    if (!hours.raw) return place.expectsHours ? <span className="text-asphalt/60">Hours not listed</span> : null;
    if (hours.failed) return <span className="text-asphalt/80">Hours: {hours.raw}</span>;
    if (!hours.info) return <span className="inline-block h-4 w-40 rounded bg-asphalt/10 motion-safe:animate-pulse" />;
    const s = STATE_STYLE[hours.info.state];
    return (
      <span className={`inline-flex items-center gap-2 font-bold ${s.text}`}>
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
        {hours.info.summary}
      </span>
    );
  })();

  return (
    <section
      ref={ref}
      role="dialog"
      aria-label="Place details"
      className={`fixed left-3 right-3 bottom-[5.75rem] z-30 flex flex-col rounded-2xl bg-paper font-hud text-asphalt shadow-[0_8px_32px_rgba(31,42,48,0.28)] md:left-auto md:right-4 md:w-[26rem] ${
        expanded ? "max-h-[min(78vh,44rem)]" : ""
      }`}
    >
      {/* Drag (or tap) the handle to expand or collapse. */}
      <button
        type="button"
        aria-label={expanded ? "Show less" : "Show more details"}
        aria-expanded={expanded}
        onClick={() => {
          // A drag already did its job; don't let the click that ends it toggle back.
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          if (hasMore) setExpanded((v) => !v);
        }}
        onPointerDown={(e) => {
          dragStart.current = e.clientY;
          dragged.current = false;
          // Keep receiving the pointer even if it leaves the handle mid-drag.
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (dragStart.current == null) return;
          const dy = e.clientY - dragStart.current;
          dragStart.current = null;
          if (Math.abs(dy) <= 30) return;
          dragged.current = true;
          if (dy < 0) {
            if (hasMore) setExpanded(true);
          } else if (expanded) setExpanded(false);
          else onClose();
        }}
        onPointerCancel={() => (dragStart.current = null)}
        className={`flex h-6 w-full flex-shrink-0 touch-none items-center justify-center rounded-t-2xl ${focusRing}`}
      >
        <span className="h-1 w-10 rounded-full bg-asphalt/25" />
      </button>

      <div className={`px-4 pb-4 ${expanded ? "overflow-y-auto" : ""}`}>
        {props.onBack && (
          <button
            type="button"
            onClick={props.onBack}
            className={`-ml-1 mb-1 flex items-center text-sm text-asphalt/70 ${focusRing}`}
          >
            <ChevronLeft aria-hidden className="h-4 w-4" /> {props.backLabel ?? "Back"}
          </button>
        )}

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug">{title}</h2>
            {subtitle && <p className="text-sm text-asphalt/70">{subtitle}</p>}
            {hoursLine && <p className="mt-1 text-sm">{hoursLine}</p>}
            {straightLine != null && status !== "loading" && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-asphalt/70 tabular-nums">
                <Car aria-hidden className="h-4 w-4" />
                {drive
                  ? `${formatDriveTime(drive.durationS)} · ${formatDistance(drive.distanceM)}`
                  : `${formatDistance(straightLine)} away`}
              </p>
            )}
          </div>
          {wiki?.imageUrl && !expanded && (
            <img
              src={wiki.imageUrl}
              alt=""
              loading="lazy"
              className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close place details"
            className={`-mr-1 rounded-full p-2 hover:bg-asphalt/10 ${focusRing}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "loading" && (
          <div role="status" className="mt-3 space-y-2">
            <div className="h-4 w-56 rounded bg-asphalt/10 motion-safe:animate-pulse" />
            <div className="h-4 w-40 rounded bg-asphalt/10 motion-safe:animate-pulse" />
          </div>
        )}
        {status === "error" && <p className="mt-2 text-sm text-signal">{error}</p>}

        {/* Action row */}
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <ActionButton icon={Navigation} label="Directions" onClick={onDirections} primary />
          {status === "ready" && place && (
            <ActionButton
              icon={Star}
              label={saved.isFavourite ? "Saved" : "Save"}
              onClick={() => {
                saved.onToggleFavourite();
                setToast(saved.isFavourite ? "Removed from Favourites" : "Saved to Favourites");
                setTimeout(() => setToast(null), 2000);
              }}
              pressed={saved.isFavourite}
            />
          )}
          {phone && <ActionButton icon={Phone} label="Call" href={telHref(phone)} />}
          {place?.website && <ActionButton icon={Globe} label="Website" href={place.website} />}
          <ActionButton icon={Share2} label="Share" onClick={share} />
        </div>
        {toast && (
          <p role="status" className="mt-2 text-xs text-asphalt/70">
            {toast}
          </p>
        )}

        {status === "ready" && place && !expanded && (
          <p className="mt-3 flex gap-2 text-sm">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 flex-shrink-0 text-asphalt/60" />
            <span>{place.address ?? "No address found here"}</span>
          </p>
        )}
        {status !== "ready" && (
          <p className="mt-2 text-xs text-asphalt/60 tabular-nums">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        )}

        {hasMore && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`mt-2 flex items-center gap-1 text-sm font-bold text-highway ${focusRing}`}
          >
            More details <ChevronDown aria-hidden className="h-4 w-4" />
          </button>
        )}

        {expanded && place && (
          <div className="mt-3">
            {wiki && (wiki.imageUrl || wiki.extract) && (
              <figure className="mb-2">
                {wiki.imageUrl && (
                  <img
                    src={wiki.imageUrl}
                    alt={`Photo of ${place.name ?? "this place"}`}
                    loading="lazy"
                    className="aspect-video w-full rounded-xl object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
                {wiki.extract && <p className="mt-2 text-sm leading-relaxed">{wiki.extract}</p>}
                <figcaption className="mt-1 text-xs text-asphalt/50">
                  {wiki.pageUrl && (
                    <a href={wiki.pageUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      From Wikipedia
                    </a>
                  )}
                  {wiki.imageUrl && wiki.imagePageUrl && (
                    <>
                      {wiki.pageUrl ? " · " : ""}
                      <a href={wiki.imagePageUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        Photo credit
                      </a>
                    </>
                  )}
                </figcaption>
              </figure>
            )}

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={saved.isHome}
                onClick={saved.onToggleHome}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${focusRing} ${
                  saved.isHome ? "bg-highway text-white" : "border border-asphalt/25"
                }`}
              >
                <House aria-hidden className="h-4 w-4" /> {saved.isHome ? "Your Home" : "Set as Home"}
              </button>
              <button
                type="button"
                aria-pressed={saved.isWork}
                onClick={saved.onToggleWork}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${focusRing} ${
                  saved.isWork ? "bg-asphalt text-white" : "border border-asphalt/25"
                }`}
              >
                <Briefcase aria-hidden className="h-4 w-4" /> {saved.isWork ? "Your Work" : "Set as Work"}
              </button>
            </div>

            {saved.isFavourite && (
              <label className="mb-3 block text-sm">
                <span className="text-asphalt/60">Your note</span>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => noteDraft !== (saved.note ?? "") && saved.onSaveNote(noteDraft)}
                  maxLength={500}
                  rows={2}
                  placeholder="e.g. Try the filter coffee"
                  className="mt-1 w-full rounded-xl border border-asphalt/20 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-asphalt"
                />
              </label>
            )}

            <div className="divide-y divide-asphalt/10 border-y border-asphalt/10">
              <Row icon={MapPin}>{place.address ?? "No address found here"}</Row>

              {hours.raw && (
                <Row icon={Clock}>
                  {hours.info ? (
                    <dl className="space-y-1">
                      {hours.info.week.map((d) => (
                        <div key={d.day} className={`flex justify-between gap-4 ${d.isToday ? "font-bold" : ""}`}>
                          <dt>{d.day}</dt>
                          <dd className="text-right tabular-nums">{d.text}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    hours.raw
                  )}
                </Row>
              )}
              {!hours.raw && place.name && place.expectsHours && (
                <Row icon={Clock}>
                  <span className="text-asphalt/60">Hours not listed.</span>{" "}
                  {place.osmUrl && (
                    <a href={place.osmUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      Add them on OpenStreetMap
                    </a>
                  )}
                </Row>
              )}

              {place.phones.map((p) => (
                <Row key={p} icon={Phone}>
                  <a href={telHref(p)} className="underline underline-offset-2">
                    {p}
                  </a>
                </Row>
              ))}
              {place.website && (
                <Row icon={Globe}>
                  <a href={place.website} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                    {place.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                </Row>
              )}
              {place.email && (
                <Row icon={Mail}>
                  <a href={`mailto:${place.email}`} className="break-all underline underline-offset-2">
                    {place.email}
                  </a>
                </Row>
              )}
              {place.social.length > 0 && (
                <Row icon={Link2}>
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    {place.social.map((s) => (
                      <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {s.label}
                      </a>
                    ))}
                  </span>
                </Row>
              )}
              {place.info.length > 0 && (
                <Row icon={place.info.some((i) => i.label === "Wheelchair") ? Accessibility : Info}>
                  <dl className="space-y-1">
                    {place.info.map((i) => (
                      <div key={i.label} className="flex justify-between gap-4">
                        <dt className="text-asphalt/60">{i.label}</dt>
                        <dd className="text-right">{i.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Row>
              )}
            </div>

            {place.features.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {place.features.map((f) => (
                  <li key={f} className="rounded-full border border-asphalt/20 px-2.5 py-0.5 text-xs">
                    {f}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-xs text-asphalt/50 tabular-nums">
              {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
              {place.osmUrl && (
                <>
                  {" · "}
                  <a href={place.osmUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Details from OpenStreetMap. Fix or add details
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
