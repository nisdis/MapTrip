import type L from "leaflet";
import { Marker } from "react-leaflet";
import { Briefcase, Home, Star } from "lucide-react";
import type { SavedEntry } from "../types/saved";
import { makePinIcon } from "../utils/pinIcons";

export const SAVED_STYLE = {
  favourite: { color: "#C98A00", Icon: Star, label: "Favourite" },
  home: { color: "#0E6B4F", Icon: Home, label: "Home" },
  work: { color: "#1F2A30", Icon: Briefcase, label: "Work" },
} as const;

const icons = Object.fromEntries(
  Object.entries(SAVED_STYLE).map(([kind, s]) => [
    kind,
    { normal: makePinIcon(`saved:${kind}`, s.color, s.Icon), selected: makePinIcon(`saved:${kind}`, s.color, s.Icon, true) },
  ]),
) as Record<keyof typeof SAVED_STYLE, { normal: L.DivIcon; selected: L.DivIcon }>;

interface SavedMarkersProps {
  entries: SavedEntry[];
  selectedId: string | null;
  onSelect: (entry: SavedEntry) => void;
}

/** Your Home, Work and Favourites on the map. */
export function SavedMarkers({ entries, selectedId, onSelect }: SavedMarkersProps) {
  return (
    <>
      {entries.map((e) => {
        const selected = e.place.id === selectedId;
        const label = e.kind === "favourite" ? e.place.name ?? "Favourite" : SAVED_STYLE[e.kind].label;
        return (
          <Marker
            key={e.key}
            position={[e.place.lat, e.place.lng]}
            icon={selected ? icons[e.kind].selected : icons[e.kind].normal}
            zIndexOffset={e.kind === "favourite" ? 500 : 600}
            title={label}
            alt={label}
            eventHandlers={{ click: () => onSelect(e) }}
          />
        );
      })}
    </>
  );
}
