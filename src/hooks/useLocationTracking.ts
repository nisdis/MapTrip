import { useState, useEffect, useRef, useCallback } from 'react';
import type { LatLngTuple } from 'leaflet';
import { SpeedEstimator } from '../utils/speedEstimator';
import { callApp, isInApp, onAppMessage, type NativeFix } from '../services/appBridge';

export interface LocationData {
  position: LatLngTuple;
  /** Smoothed speed in m/s (see SpeedEstimator); 0 when stopped. */
  speed: number;
  /** Direction of travel in degrees, kept from the last moving fix when the device omits it. */
  heading: number | null;
  altitude: number | null;
  accuracy: number;
  timestamp: number;
}

export type FixListener = (batch: LocationData[]) => void;

interface RawFix {
  lat: number;
  lng: number;
  t: number;
  accuracy: number;
  speed: number | null;
  speedAccuracy?: number | null;
  heading: number | null;
  altitude: number | null;
}

/**
 * GPS for the whole app. In a browser it comes from navigator.geolocation; in
 * the Record My Trip app it comes from the app, which also hands over fixes it
 * recorded while this page was frozen (phone locked), as one batch.
 *
 * `locationData` is the latest fix (for the map and speed display).
 * `subscribe` gets every fix, in order, in batches (for the trip recorder).
 */
export function useLocationTracking() {
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listeners = useRef(new Set<FixListener>());
  // App mode: fixes wait here until the page is ready for them (see attachApp).
  const app = useRef<{ attached: boolean; queue: NativeFix[]; lastSeq: number; take: (fixes: NativeFix[]) => void }>({
    attached: false,
    queue: [],
    lastSeq: 0,
    take: () => undefined,
  });

  const subscribe = useCallback((listener: FixListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const estimator = new SpeedEstimator();
    let lastHeading: number | null = null;

    const toData = (f: RawFix): LocationData => {
      const speed = estimator.update({
        lat: f.lat,
        lng: f.lng,
        t: f.t,
        accuracy: f.accuracy,
        speed: f.speed,
        speedAccuracy: f.speedAccuracy,
      });
      // Heading is only meaningful while moving; keep the last good one otherwise.
      if (f.heading != null && !Number.isNaN(f.heading) && speed > 0) lastHeading = f.heading;
      return {
        position: [f.lat, f.lng],
        speed,
        heading: speed > 0 ? lastHeading : null,
        altitude: f.altitude,
        accuracy: f.accuracy,
        timestamp: f.t,
      };
    };
    const emit = (batch: LocationData[]) => {
      if (!batch.length) return;
      listeners.current.forEach((l) => l(batch));
      setLocationData(batch[batch.length - 1]);
      setError(null);
    };

    if (isInApp()) {
      const state = app.current;
      state.take = (fixes) => {
        const fresh = fixes.filter((f) => f.seq > state.lastSeq).sort((a, b) => a.seq - b.seq);
        if (!fresh.length) return;
        state.lastSeq = fresh[fresh.length - 1].seq;
        emit(fresh.map(toData));
        // Tell the app these are safely here; it can forget them.
        void callApp({ type: 'ack', seq: state.lastSeq });
      };
      return onAppMessage((msg) => {
        if (msg.type !== 'fixes') return;
        if (state.attached) state.take(msg.fixes);
        else state.queue.push(...msg.fixes);
      });
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const c = position.coords;
        emit([
          toData({
            lat: c.latitude,
            lng: c.longitude,
            t: position.timestamp,
            accuracy: c.accuracy,
            speed: c.speed,
            heading: c.heading,
            altitude: c.altitude,
          }),
        ]);
      },
      (error) => {
        setError(error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  /**
   * App mode: start using the app's fixes, beginning with the ones it kept for
   * us (`pending`). Called once the recorder is ready for them, so a trip that
   * continued while the page was gone can be picked up first.
   */
  const attachApp = useCallback((pending: NativeFix[]) => {
    const state = app.current;
    state.attached = true;
    const all = [...pending, ...state.queue];
    state.queue = [];
    state.take(all);
  }, []);

  return { locationData, error, subscribe, attachApp };
}
