import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-routing-machine";
import { useMap } from "react-leaflet";
import type { SearchResult } from "../services/searchService";
import { saveRouteToHistory } from "../services/routeHistoryService";
import { routerFor, type TravelMode } from "../services/travelMode";
import type { FoundRoute } from "../services/savedRoutes";

interface RouteControlProps {
  origin: SearchResult;
  destination: SearchResult;
  isVisible: boolean;
  mode: TravelMode;
  /** the route found (to save it), or null while there's none */
  onRoute?: (route: FoundRoute | null) => void;
}

export function RouteControl({
  origin,
  destination,
  isVisible,
  mode,
  onRoute,
}: RouteControlProps) {
  const onRouteRef = useRef(onRoute);
  onRouteRef.current = onRoute;
  const map = useMap();
  const controlRef = useRef<L.Routing.Control | null>(null);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  // Build the route only when the endpoints change. Toggling the details panel
  // must not re-request the route, re-fit the map or duplicate history entries.
  useEffect(() => {
    if (!map || !origin || !destination) return;

    const router = L.Routing.osrmv1(routerFor(mode));
    // The first answer already has the full line (from each step). Without this
    // the library asks again whenever an end of the route is off screen, e.g.
    // while the map is zoomed on the destination just picked: twice the requests
    // to free servers for nothing.
    router.requiresMoreDetail = () => false;

    const routingControl = L.Routing.control({
      // Car: the public worldwide router, or your own (VITE_OSRM_URL, e.g. the
      // India-only server in /server). Bike and walk: see travelMode.ts.
      router,
      waypoints: [
        L.latLng(origin.location[0], origin.location[1]),
        L.latLng(destination.location[0], destination.location[1]),
      ],
      routeWhileDragging: false,
      addWaypoints: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      lineOptions: {
        extendToWaypoints: false,
        missingRouteTolerance: 10,
        styles: [
          { color: "#4A90E2", opacity: 0.5, weight: 6 },
          { color: "#2E75CC", opacity: 0.8, weight: 4 },
        ],
      },
    }).addTo(map);
    controlRef.current = routingControl;

    if (isVisibleRef.current) {
      routingControl.show();
    } else {
      routingControl.hide();
    }

    // Remember the route (start and end only) once one is found.
    onRouteRef.current?.(null);
    routingControl.on("routesfound", (e: { routes: L.Routing.IRoute[] }) => {
      saveRouteToHistory(origin, destination);
      const r = e.routes[0];
      onRouteRef.current?.(
        r
          ? {
              coordinates: (r.coordinates ?? []).map((c) => [c.lat, c.lng] as [number, number]),
              distanceM: r.summary?.totalDistance ?? 0,
              durationS: r.summary?.totalTime ?? 0,
            }
          : null,
      );
    });
    routingControl.on("routingerror", (e) => {
      console.error("Routing failed:", e);
    });

    return () => {
      controlRef.current = null;
      map.removeControl(routingControl);
    };
  }, [map, origin, destination, mode]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    if (isVisible) {
      control.show();
    } else {
      control.hide();
    }
  }, [isVisible]);

  return null;
}
