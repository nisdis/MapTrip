import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-routing-machine";
import { useMap } from "react-leaflet";
import type { SearchResult } from "../services/searchService";
import { saveRouteToHistory } from "../services/routeHistoryService";

interface RouteControlProps {
  origin: SearchResult;
  destination: SearchResult;
  isVisible: boolean;
}

export function RouteControl({
  origin,
  destination,
  isVisible,
}: RouteControlProps) {
  const map = useMap();
  const controlRef = useRef<L.Routing.Control | null>(null);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  // Build the route only when the endpoints change. Toggling the details panel
  // must not re-request the route, re-fit the map or duplicate history entries.
  useEffect(() => {
    if (!map || !origin || !destination) return;

    const routingControl = L.Routing.control({
      router: L.Routing.osrmv1({
        serviceUrl:
          window.location.hostname === "localhost"
            ? "http://localhost:5000/route/v1"
            : "https://router.project-osrm.org/route/v1",
      }),
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

    // Save the route once it's calculated. Only a small summary is stored:
    // full route geometry can exceed the localStorage quota.
    routingControl.on("routesfound", (e) => {
      const summary = e.routes?.[0]?.summary;
      saveRouteToHistory(origin, destination, {
        summary: summary && {
          totalDistance: summary.totalDistance,
          totalTime: summary.totalTime,
        },
      });
    });
    routingControl.on("routingerror", (e) => {
      console.error("Routing failed:", e);
    });

    return () => {
      controlRef.current = null;
      map.removeControl(routingControl);
    };
  }, [map, origin, destination]);

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
