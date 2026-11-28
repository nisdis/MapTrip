/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: your own OSRM server (default: the public router.project-osrm.org) */
  readonly VITE_OSRM_URL?: string;
}

declare module 'leaflet-routing-machine' {
  import * as L from 'leaflet';

  namespace Routing {
    interface RoutingControlOptions {
      waypoints: L.LatLng[];
      routeWhileDragging?: boolean;
      addWaypoints?: boolean;
      draggableWaypoints?: boolean;
      fitSelectedRoutes?: boolean;
      showAlternatives?: boolean;
      lineOptions?: {
        styles?: {
          color: string;
          opacity: number;
          weight: number;
        }[];
      };
    }

    class Control extends L.Control {
      constructor(options: RoutingControlOptions);
      getPlan(): unknown;
      getRouter(): unknown;
      route(): void;
    }

    namespace control {
      function control(options: RoutingControlOptions): Control;
    }
  }

  export = Routing;
}
/** The build's identity (commit, or time for local builds); set in vite.config.ts. */
declare const __BUILD_ID__: string;
declare const __BUILD_VERSION__: string;
