import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";

interface MapControllerProps {
  onZoomChange: (zoom: number) => void;
  center?: LatLngTuple;
  zoom?: number;
  reset: number;
  /** Called when the user drags the map (so auto-follow can pause). */
  onUserPan?: () => void;
  /** Height in px of a panel covering the bottom of the map. */
  bottomInset?: number;
}

export function MapController({
  onZoomChange,
  center,
  zoom,
  reset = 0,
  onUserPan,
  bottomInset = 0,
}: MapControllerProps) {
  const map = useMap();
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Report zoom changes once they settle (not on every animation frame).
  useEffect(() => {
    const handleZoom = () => {
      onZoomChange(map.getZoom());
    };
    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [map, onZoomChange]);

  useEffect(() => {
    if (!onUserPan) return;
    map.on("dragstart", onUserPan);
    return () => {
      map.off("dragstart", onUserPan);
    };
  }, [map, onUserPan]);

  // Re-center whenever the requested center changes, or a reset is requested
  // (a reset must work even if the center value itself is unchanged).
  useEffect(() => {
    if (center) {
      const z = zoomRef.current ?? map.getZoom();
      // Shift the target down so `center` appears in the middle of the visible
      // area, not under the panel.
      const point = map.project(center, z);
      point.y += bottomInset / 2;
      map.setView(map.unproject(point, z), z, {
        animate: true,
        duration: 1,
      });
    }
  }, [map, center, reset, bottomInset]);

  useEffect(() => {
    if (zoom && zoom !== map.getZoom()) {
      map.setZoom(zoom, {
        animate: true,
        duration: 1,
      });
    }
  }, [map, zoom]);
  return null;
}
