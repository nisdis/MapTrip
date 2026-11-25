import { useMemo } from "react";
import { decodePolyline } from "../../api/_lib/trackFormat";

interface RouteThumbProps {
  /** encoded polylines, one per stretch between pauses */
  lines: string[];
  className?: string;
}

/**
 * A trip's route drawn as a small shape (no map underneath). Uses the route
 * as others see it: the start and end are already trimmed off by the server.
 */
export function RouteThumb({ lines, className = "" }: RouteThumbProps) {
  const paths = useMemo(() => {
    const segs = lines.map((l) => decodePolyline(l)).filter((s) => s.length >= 2);
    if (!segs.length) return null;
    const all = segs.flat();
    const lats = all.map((p) => p[0]);
    const lngs = all.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    // Keep the shape's proportions (a degree of longitude is shorter away from the equator).
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = (maxLng - minLng) * kx || 1e-9;
    const h = maxLat - minLat || 1e-9;
    const scale = 40 / Math.max(w, h);
    const ox = (48 - w * scale) / 2;
    const oy = (48 - h * scale) / 2;
    return segs.map((s) =>
      s
        .map(([la, ln], i) => `${i ? "L" : "M"}${(ox + (ln - minLng) * kx * scale).toFixed(1)} ${(oy + (maxLat - la) * scale).toFixed(1)}`)
        .join(""),
    );
  }, [lines]);

  return (
    <svg viewBox="0 0 48 48" aria-hidden className={`flex-shrink-0 rounded-lg bg-highway/10 ${className}`}>
      {paths?.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
