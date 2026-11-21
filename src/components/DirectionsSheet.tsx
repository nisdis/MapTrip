import React, { useEffect, useMemo, useState } from "react";
import { Navigation, Crosshair, Loader2 } from "lucide-react";
import type { SearchResult } from "../services/searchService";
import { searchPlaces } from "../services/searchService";
import { debounce } from "../utils/debounce";
import { LocationData } from "../hooks/useLocationTracking";

interface DirectionsSheetProps {
  origin: SearchResult | null;
  destination: SearchResult | null;
  locationData: LocationData | null;
  onSelectOrigin: (result: SearchResult) => void;
  onSelectDestination: (result: SearchResult) => void;
  onClearDirections: () => void;
  onSaveTrip?: () => void;
}

export function DirectionsSheet({
  origin,
  destination,
  onSelectOrigin,
  onSelectDestination,
  onClearDirections,
  locationData,
  onSaveTrip,
}: DirectionsSheetProps) {
  const [originInput, setOriginInput] = useState(origin?.name || "");
  const [destinationInput, setDestinationInput] = useState(destination?.name || "");
  const [originResults, setOriginResults] = useState<SearchResult[]>([]);
  const [destinationResults, setDestinationResults] = useState<SearchResult[]>([]);
  const [isLoadingOrigin, setIsLoadingOrigin] = useState(false);
  const [isLoadingDestination, setIsLoadingDestination] = useState(false);
  const [showOriginResults, setShowOriginResults] = useState(false);
  const [showDestinationResults, setShowDestinationResults] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  useEffect(() => {
    if (origin && destination) {
      setOriginInput(origin.name);
      setDestinationInput(destination.name);
    }
  }, [origin, destination]);

  // One stable debounced function per input so their timers are independent.
  const searchOrigin = useMemo(
    () =>
      debounce(async (query: string) => {
        if (!query.trim()) {
          setOriginResults([]);
          setIsLoadingOrigin(false);
          return;
        }
        setIsLoadingOrigin(true);
        try {
          const results = await searchPlaces(query);
          setOriginResults(results);
        } catch (error) {
          console.error("Failed to search origin:", error);
        } finally {
          setIsLoadingOrigin(false);
        }
      }, 500),
    [],
  );

  const searchDestination = useMemo(
    () =>
      debounce(async (query: string) => {
        if (!query.trim()) {
          setDestinationResults([]);
          setIsLoadingDestination(false);
          return;
        }
        setIsLoadingDestination(true);
        try {
          const results = await searchPlaces(query);
          setDestinationResults(results);
        } catch (error) {
          console.error("Failed to search destination:", error);
        } finally {
          setIsLoadingDestination(false);
        }
      }, 500),
    [],
  );

  useEffect(() => {
    return () => {
      searchOrigin.cancel();
      searchDestination.cancel();
    };
  }, [searchOrigin, searchDestination]);

  const handleOriginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOriginInput(value);
    searchOrigin(value);
    setShowOriginResults(true);
  };

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDestinationInput(value);
    searchDestination(value);
    setShowDestinationResults(true);
  };

  const handleSelectOriginResult = (result: SearchResult) => {
    onSelectOrigin(result);
    setOriginInput(result.name);
    setShowOriginResults(false);
    setOriginResults([]);
  };

  const handleSelectDestinationResult = (result: SearchResult) => {
    onSelectDestination(result);
    setDestinationInput(result.name);
    setShowDestinationResults(false);
    setDestinationResults([]);
  };

  const handleClear = () => {
    setOriginInput("");
    setDestinationInput("");
    setOriginResults([]);
    setDestinationResults([]);
    setShowOriginResults(false);
    setShowDestinationResults(false);
    onClearDirections();
  };

  const selectCurrentLocation = async (lat: number, lon: number) => {
    const location: [number, number] = [lat, lon];
    let currentLocation: SearchResult = {
      id: -1,
      name: "Current location",
      displayName: `Current location (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
      location,
      type: "current",
      importance: 1,
    };
    try {
      const results = await searchPlaces(`${lat},${lon}`);
      if (results.length > 0) {
        currentLocation = { ...results[0], location };
      }
    } catch (error) {
      // Offline or lookup failed: still use the raw coordinates.
      console.error("Failed to get location details:", error);
    }
    handleSelectOriginResult(currentLocation);
    setIsGettingLocation(false);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setIsGettingLocation(true);
    if (locationData) {
      void selectCurrentLocation(
        locationData.position[0],
        locationData.position[1],
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void selectCurrentLocation(
          position.coords.latitude,
          position.coords.longitude,
        );
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Failed to get your current location");
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-lg text-gray-800">Directions</h2>
        </div>
        <button
          onClick={handleClear}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear
        </button>
      </div>

      <div className="space-y-4 flex-1">
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            From
          </label>
          <div className="relative">
            <input
              type="text"
              value={originInput}
              onChange={handleOriginChange}
              placeholder="Enter starting point"
              className="w-full px-4 py-3 bg-gray-100 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            />
            {isLoadingOrigin && (
              <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
            )}
          </div>
          <button
            onClick={handleUseCurrentLocation}
            disabled={isGettingLocation}
            className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Crosshair className="w-4 h-4" />
            {isGettingLocation ? "Getting location..." : "Use current location"}
          </button>
          {showOriginResults && originResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {originResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectOriginResult(result)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-0"
                >
                  <div className="font-medium text-gray-900">{result.name}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {result.displayName}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            To
          </label>
          <div className="relative">
            <input
              type="text"
              value={destinationInput}
              onChange={handleDestinationChange}
              placeholder="Enter destination"
              className="w-full px-4 py-3 bg-gray-100 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            />
            {isLoadingDestination && (
              <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
            )}
          </div>
          {origin && destination && onSaveTrip && (
            <button
              onClick={onSaveTrip}
              className="mt-4 w-full py-3 rounded-xl bg-blue-600 text-white font-medium"
            >
              Save as trip
            </button>
          )}
          {showDestinationResults && destinationResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {destinationResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectDestinationResult(result)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-0"
                >
                  <div className="font-medium text-gray-900">{result.name}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {result.displayName}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}