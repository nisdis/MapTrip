import { useCallback, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Map as MapIcon, Wifi, WifiOff, Car } from "lucide-react";
import { MapControls } from "./components/MapControls";
import { MapController } from "./components/MapController";
import { RouteControl } from "./components/RouteControl";
import { CurrentLocationMarker } from "./components/CurrentLocationMarker";
import { LocationDashboard } from "./components/LocationDashboard";
import { useLocationTracking } from "./hooks/useLocationTracking";
import { setupLeaflet } from "./utils/leaflet-setup";
import { getRouteHistory } from "./services/routeHistoryService";
import { clearTileCache } from "./services/tileService";
import type { SearchResult } from "./services/searchService";
import type { RouteHistoryItem } from "./services/routeHistoryService";
import { BottomSheet } from "./components/BottomSheet";
import { BottomNav } from "./components/BottomNav";
import { MoreMenu } from "./components/MoreMenu";
import { SearchSheet } from "./components/SearchSheet";
import { DirectionsSheet } from "./components/DirectionsSheet";
import { HistorySheet } from "./components/HistorySheet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { LatLngTuple } from "leaflet";

function App() {
  const [center, setCenter] = useState<LatLngTuple>([51.505, -0.09]);
  const [zoom, setZoom] = useState(15);
  const [isMapReady, setIsMapReady] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SearchResult | null>(
    null,
  );
  const [resetMap, setResetMap] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [routeHistory, setRouteHistory] = useState<RouteHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState("search");
  const [showSheet, setShowSheet] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [origin, setOrigin] = useState<SearchResult | null>(null);
  const [destination, setDestination] = useState<SearchResult | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const { locationData, error } = useLocationTracking();

  useEffect(() => {
    setupLeaflet();
    setIsMapReady(true);
    setRouteHistory(getRouteHistory());

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (locationData && !selectedLocation && !origin && !destination) {
      setCenter(locationData.position);
    }
    if (origin && destination) {
      setRouteHistory(getRouteHistory());
    }
  }, [locationData, selectedLocation, origin, destination]);

  const handleSearch = useCallback((result: SearchResult) => {
    setSelectedLocation(result);
    setCenter(result.location);
    setZoom(15);
    setShowSheet(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 1, 18));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 1, 1));
  }, []);

  const handleResetView = useCallback(() => {
    if (locationData) {
      setCenter(locationData.position);
    } else {
      setCenter([51.505, -0.09]);
    }
    setZoom(15);
    setSelectedLocation(null);
    setResetMap(Math.random());
  }, [locationData]);

  const handleSelectOrigin = useCallback((result: SearchResult) => {
    setOrigin(result);
    setCenter(result?.location);
    setZoom(15);
  }, []);

  const handleSelectDestination = useCallback((result: SearchResult) => {
    setDestination(result);
    setCenter(result?.location);
    setZoom(15);
  }, []);

  const handleClearDirections = useCallback(() => {
    setOrigin(null);
    setDestination(null);
  }, []);

  const handleSelectHistoryRoute = useCallback(
    (historyItem: RouteHistoryItem) => {
      setOrigin(historyItem.origin);
      setDestination(historyItem.destination);
      setActiveTab("directions");
      setShowSheet(true);
    },
    [],
  );

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setShowSheet(true);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setShowSheet(false);
  }, []);

  const handleToggleMore = useCallback(() => {
    setShowMoreMenu((prev) => !prev);
  }, []);

  const handleCloseMore = useCallback(() => {
    setShowMoreMenu(false);
  }, []);

  const handleCacheClick = useCallback(() => {
    alert(
      "Use the download button on the map controls to cache the current area",
    );
  }, []);

  const handleShoeRouteItems = useCallback(() => {
    setIsVisible((visible) => !visible);
  }, []);
  const handleClearClick = useCallback(() => {
    if (
      window.confirm("Are you sure you want to clear the offline map cache?")
    ) {
      setIsClearing(true);
      clearTileCache()
        .then(() => alert("Map cache cleared successfully"))
        .catch((error: unknown) => {
          console.error("Failed to clear map cache:", error);
          alert("Failed to clear map cache");
        })
        .finally(() => setIsClearing(false));
    }
  }, []);

  if (!isMapReady) {
    return null;
  }

  if (error) {
    console.error("Location error:", error);
  }

  return (
    <div className="h-screen w-screen relative bg-gray-100">
      <div className="absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-white/90 to-transparent p-4 pointer-events-none">
        <div className="max-w-7xl mx-auto pointer-events-auto">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <MapIcon className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-800">Map Trip</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isOnline ? (
                <div className="flex items-center gap-1 text-green-600 bg-white/80 px-2 py-1 rounded-full">
                  <Wifi className="w-4 h-4" />
                  <span className="text-sm font-medium">Online</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-600 bg-white/80 px-2 py-1 rounded-full">
                  <WifiOff className="w-4 h-4" />
                  <span className="text-sm font-medium">Offline</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {origin && destination && (
        <div className="absolute bottom-48 left-4 right-4 md:left-auto md:right-4 md:w-80 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 w-16">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 hidden md:visible">
              <div className="truncate text-sm font-medium text-gray-900">
                From: {origin.name}
              </div>
              <div className="truncate text-sm font-medium text-gray-900">
                To: {destination.name}
              </div>
            </div>
            <button
              onClick={handleShoeRouteItems}
              className="p-2 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
              aria-label="Show route details"
            >
              <Car className="w-5 h-5 text-blue-600" />
            </button>
          </div>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        zoomControl={false}
      >
        <MapController
          onZoomChange={setZoom}
          center={center}
          zoom={zoom}
          reset={resetMap}
        />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {locationData && <CurrentLocationMarker locationData={locationData} />}
        {selectedLocation && !origin && !destination && (
          <Marker position={selectedLocation.location}>
            <Popup>
              <div className="p-2">
                <h3 className="font-medium">{selectedLocation.name}</h3>
                <p className="text-sm text-gray-600">
                  {selectedLocation.displayName}
                </p>
              </div>
            </Popup>
          </Marker>
        )}
        {origin && destination && (
          <RouteControl
            origin={origin}
            destination={destination}
            isVisible={isVisible}
          />
        )}
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          showDownload={false}
        />
      </MapContainer>

      <LocationDashboard locationData={locationData} />

      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onMoreClick={handleToggleMore}
      />

      <MoreMenu
        isOpen={showMoreMenu}
        onClose={handleCloseMore}
        isOnline={isOnline}
        onCacheClick={handleCacheClick}
        onClearClick={handleClearClick}
        isClearing={isClearing}
        handleShoeRouteItems={handleShoeRouteItems}
      />

      <BottomSheet
        isOpen={showSheet}
        onClose={handleCloseSheet}
        snapPoints={[0.4, 0.7, 0.9]}
      >
        {activeTab === "search" && <SearchSheet onSearch={handleSearch} />}
        {activeTab === "directions" && (
          <DirectionsSheet
            origin={origin}
            destination={destination}
            onSelectOrigin={handleSelectOrigin}
            onSelectDestination={handleSelectDestination}
            onClearDirections={handleClearDirections}
            locationData={locationData}
          />
        )}
        {activeTab === "history" && (
          <HistorySheet
            history={routeHistory}
            onSelectRoute={handleSelectHistoryRoute}
          />
        )}
      </BottomSheet>
    </div>
  );
}

export default App;
