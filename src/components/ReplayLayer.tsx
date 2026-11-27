import { useEffect, useRef } from "react";
import { CircleMarker, useMap } from "react-leaflet";
import type { Replay } from "../hooks/useReplay";
import { MS_TO_KMH, speedColor } from "../utils/tripStats";

/** Street level: close enough to see where the dot is, wide enough to keep up at speed. */
const FOLLOW_ZOOM = 15;

interface ReplayLayerProps {
  replay: Replay;
  /** Height in px of the panel covering the bottom of the map. */
  bottomInset?: number;
}

/**
 * The moving dot (coloured like the trail at that speed) and, while
 * following, the map keeping it in view. Dragging the map stops following.
 */
export function ReplayLayer({ replay, bottomInset = 0 }: ReplayLayerProps) {
  const map = useMap();
  const { state, started, follow, setFollow } = replay;
  const zoomedIn = useRef(false);

  useEffect(() => {
    const stop = () => setFollow(false);
    map.on("dragstart", stop);
    return () => {
      map.off("dragstart", stop);
    };
  }, [map, setFollow]);

  useEffect(() => {
    if (!follow) zoomedIn.current = false;
  }, [follow]);

  useEffect(() => {
    if (!started || !follow || !state) return;
    // Don't fight a pinch-zoom in progress.
    if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) return;
    const z = zoomedIn.current ? map.getZoom() : Math.max(map.getZoom(), FOLLOW_ZOOM);
    zoomedIn.current = true;
    // Keep the dot in the middle of the part of the map not under the panel.
    const point = map.project([state.lat, state.lng], z);
    point.y += bottomInset / 2;
    map.setView(map.unproject(point, z), z, { animate: false });
  }, [map, started, follow, state, bottomInset]);

  if (!started || !state) return null;
  return (
    <CircleMarker
      center={[state.lat, state.lng]}
      radius={9}
      interactive={false}
      className="replay-dot"
      pathOptions={{
        color: "#FFFFFF",
        weight: 3,
        fillColor: speedColor(state.speedMs * MS_TO_KMH),
        fillOpacity: 1,
      }}
    />
  );
}
