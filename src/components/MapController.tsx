import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";

interface MapControllerProps {
  onZoomChange: (zoom: number) => void;
  center?: LatLngTuple;
  zoom?: number;
  reset: number;
}

export function MapController({
  onZoomChange,
  center,
  zoom,
  reset = 0,
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

  // Re-center whenever the requested center changes, or a reset is requested
  // (a reset must work even if the center value itself is unchanged).
  useEffect(() => {
    if (center) {
      map.setView(center, zoomRef.current ?? map.getZoom(), {
        animate: true,
        duration: 1,
      });
    }
  }, [map, center, reset]);

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
