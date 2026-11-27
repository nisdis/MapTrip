import { useMemo } from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import { isVideo, type TripPhoto } from "../types/trip";

// Lucide "camera" and "video" glyphs, inlined (markers are plain HTML).
const CAMERA =
  '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>';
const VIDEO = '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>';

const icon = (video: boolean, count: number) =>
  L.divIcon({
    className: "media-pin",
    html: `<div style="position:relative;width:30px;height:30px;border-radius:9999px;background:#fff;border:2px solid ${video ? "#7c3aed" : "#0e6b4f"};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${video ? "#7c3aed" : "#0e6b4f"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${video ? VIDEO : CAMERA}</svg>${
      count > 1
        ? `<span style="position:absolute;top:-7px;right:-7px;min-width:18px;height:18px;padding:0 4px;border-radius:9999px;background:#1f2a30;color:#fff;font:700 11px/18px system-ui;text-align:center">${count}</span>`
        : ""
    }</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

interface MediaPinsProps {
  media: TripPhoto[];
  /** the group at that spot, and which one was tapped */
  onOpen: (group: TripPhoto[], index: number) => void;
}

/**
 * Each photo and video at the spot on the route where it was taken. Several
 * taken at about the same spot (~10 m) share one pin with a count; it opens
 * the first, and the viewer steps through the rest.
 */
export function MediaPins({ media, onOpen }: MediaPinsProps) {
  const groups = useMemo(() => {
    const at = new Map<string, TripPhoto[]>();
    for (const m of media) {
      if (m.lat == null || m.lng == null) continue;
      const key = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`;
      at.set(key, [...(at.get(key) ?? []), m]);
    }
    return [...at.values()].map((g) => g.sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0)));
  }, [media]);
  return (
    <>
      {groups.map((g) => {
        const allVideo = g.every(isVideo);
        const label = g.length > 1 ? `${g.length} photos and videos` : allVideo ? "Video" : "Photo";
        return (
          <Marker
            key={g[0].id}
            position={[g[0].lat!, g[0].lng!]}
            icon={icon(allVideo, g.length)}
            zIndexOffset={800}
            title={label}
            alt={`${label} taken here`}
            eventHandlers={{ click: () => onOpen(g, 0) }}
          />
        );
      })}
    </>
  );
}
