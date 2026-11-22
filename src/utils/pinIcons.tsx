import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import type { Coffee } from "lucide-react";

const cache = new Map<string, L.DivIcon>();

/** SVG markup for an icon component, using the React DOM already in the bundle. */
function svgMarkup(node: React.ReactElement): string {
  const el = document.createElement("div");
  const root = createRoot(el);
  flushSync(() => root.render(node));
  const html = el.innerHTML;
  root.unmount();
  return html;
}

/**
 * A teardrop map pin in `color` with a white icon. Build pins at module load
 * (not during a React render): flushSync must not run while React is rendering.
 */
export function makePinIcon(key: string, color: string, Icon: typeof Coffee, selected = false): L.DivIcon {
  const cacheKey = `${key}:${selected}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const svg = svgMarkup(<Icon size={selected ? 18 : 15} color="#FFFFFF" strokeWidth={2.4} aria-hidden />);
  const size = selected ? 38 : 30;
  const icon = L.divIcon({
    className: "",
    html: `<div class="category-pin${selected ? " is-selected" : ""}" style="--pin:${color}"><span>${svg}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
  cache.set(cacheKey, icon);
  return icon;
}
