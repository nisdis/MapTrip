import { useMemo } from "react";
import { Marker } from "react-leaflet";
import type { NearbyResult } from "../services/placeService";
import { CATEGORY_STYLE, categoryStyle } from "../utils/categoryStyle";
import { makePinIcon } from "../utils/pinIcons";

interface NearbyMarkersProps {
  categoryId: string;
  results: NearbyResult[];
  selectedId: string | null;
  onSelect: (r: NearbyResult) => void;
}

const pin = (id: string, selected: boolean) => {
  const { color, Icon } = categoryStyle(id);
  return makePinIcon(`cat:${id}`, color, Icon, selected);
};

// Build every pin once at load time.
for (const id of Object.keys(CATEGORY_STYLE)) {
  pin(id, false);
  pin(id, true);
}

export function NearbyMarkers({ categoryId, results, selectedId, onSelect }: NearbyMarkersProps) {
  const icons = useMemo(() => ({ normal: pin(categoryId, false), selected: pin(categoryId, true) }), [categoryId]);
  return (
    <>
      {results.map((r) => {
        const selected = r.place.id === selectedId;
        return (
          <Marker
            key={r.place.id}
            position={[r.place.lat, r.place.lng]}
            icon={selected ? icons.selected : icons.normal}
            zIndexOffset={selected ? 1000 : 0}
            title={r.place.name ?? undefined}
            alt={r.place.name ?? "Place"}
            eventHandlers={{ click: () => onSelect(r) }}
          />
        );
      })}
    </>
  );
}
