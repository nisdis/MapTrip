import React, { useEffect, useState } from "react";
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
}

export function DirectionsSheet({
  origin,
  destination,
  onSelectOrigin,
  onSelectDestination,
  onClearDirections,
  locationData,
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

  const searchOrigin = debounce(async (query: string) => {
    if (!query.trim()) {
      setOriginResults([]);
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
  }, 300);

  const searchDestination = debounce(async (query: string) => {
    if (!query.trim()) {
      setDestinationResults([]);
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
  }, 300);

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

  const handleCurrentLocation = async (position: GeolocationPosition) => {
    try {
      const results = await searchPlaces(
        `${position.coords.latitude},${position.coords.longitude}`,
      );
      if (results.length > 0) {
        const currentLocation: SearchResult = {
          ...results[0],
          location: [position.coords.latitude, position.coords.longitude],
        };
        handleSelectOriginResult(currentLocation);
      }
    } catch (error) {
      console.error("Failed to get location details:", error);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleUseCurrentLocation = () => {
    setIsGettingLocation(true);
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      setIsGettingLocation(false);
      return;
    }
    if (locationData) {
      const coords: GeolocationCoordinates = {
        latitude: locationData.position[0],
        longitude: locationData.position[1],
        altitude: locationData.altitude || null,
        accuracy: locationData.accuracy || 0,
        altitudeAccuracy: null,
        heading: locationData.heading || null,
        speed: locationData.speed || null,
        toJSON: () => ({}),
      };
      const positionData: GeolocationPosition = {
        timestamp: locationData.timestamp,
        coords,
        toJSON: () => ({}),
      };
      handleCurrentLocation(positionData);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        handleCurrentLocation(position);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Failed to get your current location");
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
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