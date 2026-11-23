import { useMap, useMapEvents } from "react-leaflet";
import { queryPoiNear } from "../services/basemapRegistry";
import type { PoiHint } from "../services/placeService";

interface MapTapHandlerProps {
  disabled?: boolean;
  onTap: (lat: number, lng: number, hint: PoiHint | null, toleranceM: number) => void;
}

/** Reports taps on the map, with the place icon under the finger if there is one. */
export function MapTapHandler({ disabled, onTap }: MapTapHandlerProps) {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (disabled) return;
      const { lat, lng } = e.latlng;
      // About a fingertip (24 px), in metres at this zoom and latitude.
      const metresPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
      const toleranceM = Math.min(60, Math.max(12, metresPerPixel * 24));
      onTap(lat, lng, queryPoiNear(lat, lng), toleranceM);
    },
  });
  return null;
}
