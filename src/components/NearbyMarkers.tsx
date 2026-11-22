import { useMemo } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import { Marker } from "react-leaflet";
import type { NearbyResult } from "../services/placeService";
import { CATEGORY_STYLE, categoryStyle } from "../utils/categoryStyle";

interface NearbyMarkersProps {
  categoryId: string;
  results: NearbyResult[];
  selectedId: string | null;
  onSelect: (r: NearbyResult) => void;
}

const iconCache = new Map<string, L.DivIcon>();

/** SVG markup for an icon component, using the React DOM already in the bundle. */
function svgMarkup(node: React.ReactElement): string {
  const el = document.createElement("div");
  const root = createRoot(el);
  flushSync(() => root.render(node));
  const html = el.innerHTML;
  root.unmount();
  return html;
}

/** A coloured pin with the category's icon. */
function pinIcon(categoryId: string, selected: boolean): L.DivIcon {
  const key = `${categoryId}:${selected}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const { color, Icon } = categoryStyle(categoryId);
  const svg = svgMarkup(<Icon size={selected ? 18 : 15} color="#FFFFFF" strokeWidth={2.4} aria-hidden />);
  const size = selected ? 38 : 30;
  const icon = L.divIcon({
    className: "",
    html: `<div class="category-pin${selected ? " is-selected" : ""}" style="--pin:${color}"><span>${svg}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
  iconCache.set(key, icon);
  return icon;
}

// Build every pin once at load time: flushSync must not run while React is rendering.
for (const id of Object.keys(CATEGORY_STYLE)) {
  pinIcon(id, false);
  pinIcon(id, true);
}

export function NearbyMarkers({ categoryId, results, selectedId, onSelect }: NearbyMarkersProps) {
  const icons = useMemo(
    () => ({ normal: pinIcon(categoryId, false), selected: pinIcon(categoryId, true) }),
    [categoryId],
  );
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
