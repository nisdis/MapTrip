import { useState, useEffect } from 'react';
import type { LatLngTuple } from 'leaflet';
import { SpeedEstimator } from '../utils/speedEstimator';

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

export function useLocationTracking() {
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    const estimator = new SpeedEstimator();
    let lastHeading: number | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const c = position.coords;
        const speed = estimator.update({
          lat: c.latitude,
          lng: c.longitude,
          t: position.timestamp,
          accuracy: c.accuracy,
          speed: c.speed,
        });
        // Heading is only meaningful while moving; keep the last good one otherwise.
        if (c.heading != null && !Number.isNaN(c.heading) && speed > 0) lastHeading = c.heading;
        setLocationData({
          position: [c.latitude, c.longitude],
          speed,
          heading: speed > 0 ? lastHeading : null,
          altitude: c.altitude,
          accuracy: c.accuracy,
          timestamp: position.timestamp,
        });
        setError(null);
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

  return { locationData, error };
}
