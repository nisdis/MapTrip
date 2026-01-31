// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useEffect } from "react";
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
  reset,
}: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    const handleZoom = () => {
      onZoomChange(map.getZoom());
    };
    map.on("zoom", handleZoom);
    return () => {
      map.off("zoom", handleZoom);
    };
  }, [map, onZoomChange]);
  useEffect(() => {
    if (reset && center) {
      map.locate();
      map.setView(center, 15, {
        animate: true,
        duration: 1,
      });
    }
  }, [reset, map]);

  useEffect(() => {
    if (zoom) {
      map.setZoom(zoom, {
        animate: true,
        duration: 1,
      });
    }
  }, [map, zoom]);
  useEffect(() => {
    if (center) {
      map.setView(center, 18, {
        animate: true,
        duration: 1,
      });
    }
  }, [map, center]);
  return null;
}
