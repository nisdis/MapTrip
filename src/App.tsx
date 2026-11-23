import { useCallback, useState, useEffect, useRef } from "react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import { NearbyMarkers } from "./components/NearbyMarkers";
import { VectorBasemap } from "./components/VectorBasemap";
import { Map as MapIcon, Wifi, WifiOff, Car, UserRound } from "lucide-react";
import { MapControls } from "./components/MapControls";
import { MapController } from "./components/MapController";
import { RouteControl } from "./components/RouteControl";
import { CurrentLocationMarker } from "./components/CurrentLocationMarker";
import { SpeedPill } from "./components/SpeedPill";
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
import { SavedSheet } from "./components/SavedSheet";
import { SavedMarkers } from "./components/SavedMarkers";
import type { SavedEntry } from "./types/saved";
import { TripsSheet } from "./components/TripsSheet";
import { AccountSheet } from "./components/AccountSheet";
import { TripLayer } from "./components/TripLayer";
import { PlaceSheet } from "./components/PlaceSheet";
import { CategoryChips } from "./components/CategoryChips";
import { NearbyList } from "./components/NearbyList";
import { useNearby } from "./hooks/useNearby";
import { lookupById, type Bounds, type NearbyCategory, type NearbyResult } from "./services/placeService";
import { MapTapHandler } from "./components/MapTapHandler";
import { usePlaceLookup } from "./hooks/usePlaceLookup";
import { useSaved, snapshotOf } from "./hooks/useSaved";
import { useSavedSync } from "./hooks/useSavedSync";
import { favouriteKey } from "./types/saved";
import type { PoiHint } from "./services/placeService";
import { RecorderHud } from "./components/RecorderHud";
import { PocketMode } from "./components/PocketMode";
import { gapDistance } from "./types/trip";
import { TripSummary } from "./components/TripSummary";
import { DraftBanner } from "./components/DraftBanner";
import { clearDraft } from "./services/draftStore";
import { computeStats } from "./utils/tripStats";
import { useTripRecorder } from "./hooks/useTripRecorder";
import { useAuth } from "./hooks/useAuth";
import { authClient } from "./services/authClient";
import {
  deleteLocalTrip,
  listLocalTrips,
  newTripId,
  saveTripLocally,
} from "./services/tripStore";
import { saveTripToCloud } from "./services/cloudTrips";
import {
  deletePhotoBlob,
  prepareImage,
  savePhotoBlob,
} from "./services/photoStore";
import type { Trip } from "./types/trip";
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
  const hasCenteredOnUser = useRef(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [viewTrip, setViewTrip] = useState<Trip | null>(null);
  const recorder = useTripRecorder(locationData);
  const placeLookup = usePlaceLookup();
  const saved = useSaved();
  const [showSavedOnMap, setShowSavedOnMap] = useState(() => {
    try {
      return localStorage.getItem("showSavedOnMap") !== "0";
    } catch {
      return true;
    }
  });
  const toggleShowSavedOnMap = useCallback(() => {
    setShowSavedOnMap((v) => {
      try {
        localStorage.setItem("showSavedOnMap", v ? "0" : "1");
      } catch {
        /* per-device preference only */
      }
      return !v;
    });
  }, []);
  const nearby = useNearby();
  // Visible map area, for "places in this area" searches.
  const boundsRef = useRef<Bounds | null>(null);
  const [areaMoved, setAreaMoved] = useState(false);
  const auth = useAuth();
  const savedSync = useSavedSync(saved, auth.user?.id ?? null);

  const refreshTrips = useCallback(async () => {
    try {
      setTrips(await listLocalTrips());
    } catch (e) {
      console.error("Failed to load trips:", e);
    }
  }, []);

  useEffect(() => {
    void refreshTrips();
  }, [refreshTrips]);

  const persistTrip = useCallback(
    async (trip: Trip) => {
      try {
        await saveTripLocally(trip);
        await refreshTrips();
      } catch (e) {
        console.error("Failed to save trip:", e);
        alert("Couldn't save the trip in this browser (storage may be full).");
      }
    },
    [refreshTrips],
  );

  const isRecorderActive = recorder.status !== "idle";
  const isLive = recorder.status === "recording" || recorder.status === "paused";
  // While recording, the map follows you until you drag it away.
  const [follow, setFollow] = useState(true);
  const [pocket, setPocket] = useState(false);
  const estimatedM = gapDistance(recorder.gaps);
  // Height of whichever recorder panel covers the bottom of the map.
  const [panelHeight, setPanelHeight] = useState(0);

  const handleStartRecording = useCallback(() => {
    setViewTrip(null);
    setShowSheet(false);
    setShowMoreMenu(false);
    setFollow(true);
    recorder.start();
  }, [recorder]);

  const handleSaveRecordedTrip = useCallback(
    async (name: string) => {
      const stats = computeStats(recorder.track, recorder.activeSeconds);
      const trip: Trip = {
        id: newTripId(),
        name,
        kind: "recorded",
        createdAt: recorder.startedAt,
        track: recorder.track,
        gaps: recorder.gaps,
        // Total includes the estimated stretches; they're kept in `gaps` so the
        // measured part can always be told apart.
        distanceM: stats.distanceM + gapDistance(recorder.gaps),
        durationS: recorder.activeSeconds,
      };
      await persistTrip(trip);
      recorder.reset();
      setViewTrip(trip);
    },
    [recorder, persistTrip],
  );

  const handleDiscardRecordedTrip = useCallback(() => {
    setPocket(false);
    recorder.reset();
  }, [recorder]);

  const handleFinishRecording = useCallback(() => {
    setPocket(false);
    if (recorder.track.length < 2) {
      recorder.reset();
      alert("That trip was too short to save. Move a little before finishing.");
      return;
    }
    recorder.finish();
  }, [recorder]);

  const handleSavePlannedTrip = useCallback(async () => {
    if (!origin || !destination) return;
    await persistTrip({
      id: newTripId(),
      name: `${origin.name} → ${destination.name}`,
      kind: "planned",
      createdAt: Date.now(),
      origin,
      destination,
      distanceM: 0,
      durationS: 0,
    });
    setActiveTab("trips");
  }, [origin, destination, persistTrip]);

  const handleViewTrip = useCallback((trip: Trip) => {
    if (trip.kind === "planned" && trip.origin && trip.destination) {
      setViewTrip(null);
      setOrigin(trip.origin);
      setDestination(trip.destination);
      setActiveTab("directions");
    } else {
      setViewTrip(trip);
      setShowSheet(false);
    }
  }, []);

  const handleDeleteTrip = useCallback(
    async (trip: Trip) => {
      await Promise.all((trip.photos ?? []).map((p) => deletePhotoBlob(p.id)));
      await deleteLocalTrip(trip.id);
      setViewTrip((v) => (v?.id === trip.id ? null : v));
      await refreshTrips();
    },
    [refreshTrips],
  );

  const handleSaveToCloud = useCallback(
    async (trip: Trip) => {
      // Sign-in just completed? The session hook may lag a render, so read it fresh.
      const session = await authClient.getSession();
      const userId = session.data?.user.id;
      if (!userId) throw new Error("Please sign in to save to the cloud");
      const saved = await saveTripToCloud(trip, userId);
      await persistTrip(saved);
    },
    [persistTrip],
  );

  const handleAddPhoto = useCallback(
    async (trip: Trip, file: File) => {
      const blob = await prepareImage(file);
      const photo = { id: newTripId(), addedAt: Date.now() };
      await savePhotoBlob(photo.id, blob);
      await persistTrip({ ...trip, photos: [...(trip.photos ?? []), photo] });
    },
    [persistTrip],
  );

  const handleRemovePhoto = useCallback(
    async (trip: Trip, photoId: string) => {
      await deletePhotoBlob(photoId);
      await persistTrip({
        ...trip,
        photos: (trip.photos ?? []).filter((p) => p.id !== photoId),
      });
    },
    [persistTrip],
  );

  useEffect(() => {
    if (error) console.error("Location error:", error);
  }, [error]);

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
    // Center on the user once, on the first GPS fix. Re-centering on every
    // update would fight the user whenever they pan the map.
    if (
      locationData &&
      !hasCenteredOnUser.current &&
      !selectedLocation &&
      !origin &&
      !destination
    ) {
      hasCenteredOnUser.current = true;
      setCenter(locationData.position);
    }
  }, [locationData, selectedLocation, origin, destination]);

  useEffect(() => {
    if (recorder.status === "recording" && follow && locationData) {
      setCenter(locationData.position);
    }
  }, [recorder.status, follow, locationData]);

  // Shared links open their place once the app starts:
  //   /p/node/123 (exact place), /p/pin/lat,lng, and the older /?place=lat,lng.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromPath = window.location.pathname.match(/^\/p\/((?:node|way|relation)\/\d+|pin\/-?[\d.]+,-?[\d.]+)$/)?.[1];
    const osm = fromPath ?? params.get("osm");
    const osmId = osm?.match(/^(node|way|relation)\/\d+$/) ? osm : null;
    if (osmId) {
      hasCenteredOnUser.current = true;
      lookupById(osmId)
        .then((details) => {
          if (!details) return;
          placeLookup.show(details);
          setCenter([details.lat, details.lng]);
          setZoom(17);
        })
        .catch((e) => console.error("Couldn't open shared place:", e));
      return;
    }
    const pin = osm?.match(/^pin\/(-?[\d.]+),(-?[\d.]+)$/);
    const m = pin ?? params.get("place")?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!m) return;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    hasCenteredOnUser.current = true; // don't jump to the user's location over the shared place
    setCenter([lat, lng]);
    setZoom(17);
    placeLookup.open(lat, lng, null, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUserPan = useCallback(() => {
    setFollow(false);
    setAreaMoved(true);
  }, []);
  const handleBoundsChange = useCallback((b: Bounds) => {
    boundsRef.current = b;
  }, []);

  const runNearby = useCallback(
    (category: NearbyCategory) => {
      const b = boundsRef.current;
      if (!b) return;
      // Distances from you if you're in view, else from the middle of the map.
      const mid = { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
      const me = locationData ? { lat: locationData.position[0], lng: locationData.position[1] } : null;
      const inView = me && me.lat <= b.north && me.lat >= b.south && me.lng <= b.east && me.lng >= b.west;
      placeLookup.close();
      setShowSheet(false);
      setAreaMoved(false);
      nearby.search(category, b, inView ? me : mid);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationData, nearby.search, placeLookup.close],
  );

  const handleSelectCategory = useCallback(
    (category: NearbyCategory) => {
      if (nearby.state?.category.id === category.id) nearby.clear();
      else runNearby(category);
    },
    [nearby, runNearby],
  );

  const handleSelectNearby = useCallback(
    (r: NearbyResult) => {
      placeLookup.show(r.place);
      setCenter([r.place.lat, r.place.lng]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placeLookup.show],
  );

  // Tapping the map shows details for that spot (or the place icon that was tapped).
  const handleMapTap = useCallback(
    (lat: number, lng: number, hint: PoiHint | null, toleranceM: number) => {
      setShowMoreMenu(false);
      placeLookup.open(lat, lng, hint, toleranceM);
      setCenter([hint?.lat ?? lat, hint?.lng ?? lng]);
    },
    [placeLookup.open], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Route to a place, starting from where you are unless a start point is set. */
  const routeTo = useCallback(
    (to: { lat: number; lng: number; name: string; address: string | null; category: string | null }) => {
      const here: [number, number] = [to.lat, to.lng];
      setDestination({
        id: Date.now(),
        name: to.name,
        displayName: to.address ?? `${here[0].toFixed(5)}, ${here[1].toFixed(5)}`,
        location: here,
        type: to.category ?? "pin",
        importance: 1,
      });
      if (!origin && locationData) {
        setOrigin({
          id: -1,
          name: "Current location",
          displayName: "Current location",
          location: locationData.position,
          type: "current",
          importance: 1,
        });
      }
    },
    [origin, locationData],
  );

  const handleDirectionsToPlace = useCallback(() => {
    const target = placeLookup.target;
    if (!target) return;
    const place = placeLookup.place;
    routeTo({
      lat: target.lat,
      lng: target.lng,
      name: place?.name ?? "Dropped pin",
      address: place?.address ?? null,
      category: place?.category ?? null,
    });
    setSelectedLocation(null);
    placeLookup.close();
    setActiveTab("directions");
    setShowSheet(true);
  }, [placeLookup, routeTo]);

  const handleOpenSaved = useCallback(
    (entry: SavedEntry) => {
      setShowSheet(false);
      nearby.clear();
      placeLookup.openKnown(entry.place);
      setCenter([entry.place.lat, entry.place.lng]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placeLookup.openKnown, nearby.clear],
  );

  const shortcutFor = useCallback(
    (entry: SavedEntry | null, label: string) =>
      entry
        ? {
            label,
            onPick: () =>
              routeTo({
                lat: entry.place.lat,
                lng: entry.place.lng,
                name: label,
                address: entry.place.address,
                category: null,
              }),
          }
        : null,
    [routeTo],
  );

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
    setFollow(true);
    setResetMap((n) => n + 1);
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
      setCenter(historyItem.origin.location);
      setActiveTab("directions");
      setShowSheet(true);
    },
    [],
  );

  const closePlace = placeLookup.close;
  const handleTabChange = useCallback((tab: string) => {
    closePlace();
    if (tab === "trips") {
      // Routes are saved asynchronously once found, so re-read when viewing.
      setRouteHistory(getRouteHistory());
    }
    setActiveTab(tab);
    setShowSheet(true);
  }, [closePlace]);

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

  return (
    <div className="h-screen w-screen relative bg-gray-100">
      {!isRecorderActive && (
      <div className="absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-white/90 to-transparent p-4 pointer-events-none">
        <div className="max-w-7xl mx-auto pointer-events-auto">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <MapIcon className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-800">Map Trip</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTabChange("account")}
                aria-label={auth.user ? "Account" : "Sign in"}
                title={auth.user ? "Account" : "Sign in"}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
              >
                {auth.user ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold uppercase text-white">
                    {auth.user.email?.[0] ?? "?"}
                  </span>
                ) : (
                  <UserRound aria-hidden className="h-5 w-5 text-blue-600" />
                )}
              </button>
              {/* Online is the normal state, so only the offline badge needs attention. */}
              <span
                role="status"
                title={isOnline ? "Online" : "Offline: saved trips and cached maps still work"}
                className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/80 ${
                  isOnline ? "text-green-600" : "text-amber-600"
                }`}
              >
                {isOnline ? <Wifi aria-hidden className="h-4 w-4" /> : <WifiOff aria-hidden className="h-4 w-4" />}
                <span className="sr-only">{isOnline ? "Online" : "Offline"}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      )}

      {origin && destination && !isRecorderActive && (
        <div className="absolute bottom-48 left-4 right-4 md:left-auto md:right-4 md:w-80 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 w-16">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 hidden md:block">
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
        minZoom={2}
        maxBounds={[[-85, -Infinity], [85, Infinity]]}
        maxBoundsViscosity={1}
      >
        <MapController
          onZoomChange={setZoom}
          center={center}
          zoom={zoom}
          reset={resetMap}
          onUserPan={handleUserPan}
          onBoundsChange={handleBoundsChange}
          bottomInset={
            isRecorderActive ? panelHeight : placeLookup.target ? panelHeight + 96 : 0
          }
        />
        <VectorBasemap />
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
        <MapTapHandler disabled={isRecorderActive} onTap={handleMapTap} />
        {!isRecorderActive && showSavedOnMap && (
          <SavedMarkers
            entries={[...(saved.home ? [saved.home] : []), ...(saved.work ? [saved.work] : []), ...saved.favourites]}
            selectedId={placeLookup.place?.id ?? null}
            onSelect={handleOpenSaved}
          />
        )}
        {!isRecorderActive && nearby.state && (
          <NearbyMarkers
            categoryId={nearby.state.category.id}
            results={nearby.state.results}
            selectedId={placeLookup.place?.id ?? null}
            onSelect={handleSelectNearby}
          />
        )}
        {/* A list place is shown by its own (enlarged) category pin; other spots get the plain pin. */}
        {placeLookup.target &&
          !isRecorderActive &&
          !nearby.state?.results.some((r) => r.place.id === placeLookup.place?.id) &&
          !(
            showSavedOnMap &&
            placeLookup.place &&
            [saved.home, saved.work, ...saved.favourites].some((e) => e?.place.id === placeLookup.place?.id)
          ) && (
          <Marker position={[placeLookup.target.lat, placeLookup.target.lng]} />
        )}
        {isRecorderActive ? (
          <TripLayer
            track={recorder.track}
            gaps={recorder.gaps}
            fitKey={recorder.status === "review" ? "review" : null}
            bottomInset={panelHeight}
          />
        ) : (
          viewTrip?.track && (
            <TripLayer track={viewTrip.track} gaps={viewTrip.gaps} fitKey={viewTrip.id} showEnds />
          )
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

      {!isRecorderActive && !placeLookup.target && !nearby.state && (
        <SpeedPill locationData={locationData} />
      )}

      {!isRecorderActive && (
        <CategoryChips activeId={nearby.state?.category.id ?? null} onSelect={handleSelectCategory} />
      )}

      {!isRecorderActive && nearby.state && areaMoved && !placeLookup.target && (
        <button
          type="button"
          onClick={() => runNearby(nearby.state!.category)}
          className="fixed left-1/2 top-[7.5rem] z-20 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-bold text-asphalt shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-asphalt"
        >
          Search this area
        </button>
      )}

      {!isRecorderActive && nearby.state && !placeLookup.target && (
        <NearbyList
          state={nearby.state}
          onSelect={handleSelectNearby}
          onClose={nearby.clear}
          onHeight={setPanelHeight}
        />
      )}

      {!isRecorderActive && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onMoreClick={handleToggleMore}
          onRecord={handleStartRecording}
        />
      )}

      {placeLookup.target && !isRecorderActive && placeLookup.status !== "idle" && (
        <PlaceSheet
          status={placeLookup.status}
          coords={placeLookup.target}
          place={placeLookup.place}
          error={placeLookup.error}
          userPosition={locationData ? [locationData.position[0], locationData.position[1]] : null}
          saved={(() => {
            const p = placeLookup.place;
            const fav = p ? saved.favourites.find((e) => e.key === favouriteKey(p.id)) : undefined;
            const toggleLabel = (kind: "home" | "work") => {
              if (!p) return;
              const current = kind === "home" ? saved.home : saved.work;
              void saved.setLabel(kind, current?.place.id === p.id ? null : snapshotOf(p));
            };
            return {
              isFavourite: !!fav,
              isHome: !!p && saved.home?.place.id === p.id,
              isWork: !!p && saved.work?.place.id === p.id,
              note: fav?.note ?? null,
              // Act on what the button showed (see setFavourite).
              onToggleFavourite: () => p && void saved.setFavourite(snapshotOf(p), !fav),
              onToggleHome: () => toggleLabel("home"),
              onToggleWork: () => toggleLabel("work"),
              onSaveNote: (note: string) => p && void saved.setNote(favouriteKey(p.id), note),
            };
          })()}
          backLabel={nearby.state ? nearby.state.category.label : undefined}
          onBack={nearby.state ? placeLookup.close : undefined}
          onClose={placeLookup.close}
          onDirections={handleDirectionsToPlace}
          onHeight={setPanelHeight}
        />
      )}

      {isLive && (
        <RecorderHud
          status={recorder.status as "recording" | "paused"}
          speedMs={recorder.speedMs}
          maxSpeedMs={recorder.maxSpeedMs}
          distanceM={recorder.distanceM}
          activeSeconds={recorder.activeSeconds}
          altitudeM={recorder.altitudeM}
          accuracyM={recorder.accuracyM}
          onPause={recorder.pause}
          onResume={recorder.resume}
          onFinish={handleFinishRecording}
          onHeight={setPanelHeight}
          estimatedM={estimatedM}
          lastGap={recorder.lastGap}
          onPocket={() => {
            setPocket(true);
            setFollow(false); // nothing to see under the black screen: skip map work
          }}
        />
      )}

      {pocket && isLive && (
        <PocketMode
          distanceM={recorder.distanceM + estimatedM}
          activeSeconds={recorder.activeSeconds}
          onWake={() => {
            setPocket(false);
            setFollow(true);
          }}
        />
      )}

      {recorder.status === "review" && (
        <TripSummary
          defaultName={`Trip, ${new Date(recorder.startedAt).toLocaleString([], {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}`}
          activeSeconds={recorder.activeSeconds}
          stats={computeStats(recorder.track, recorder.activeSeconds)}
          onSave={handleSaveRecordedTrip}
          onDiscard={handleDiscardRecordedTrip}
          onHeight={setPanelHeight}
          estimatedM={estimatedM}
        />
      )}

      {recorder.status === "idle" && recorder.draft && (
        <DraftBanner
          draft={recorder.draft}
          onReview={recorder.restoreDraft}
          onDiscard={() => {
            void clearDraft();
            recorder.reset();
          }}
        />
      )}


      {isLive && !follow && (
        <button
          type="button"
          onClick={handleResetView}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-20 rounded-full bg-asphalt px-5 py-3 font-hud text-sm font-bold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Recenter on me
        </button>
      )}

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
            onSaveTrip={handleSavePlannedTrip}
            shortcuts={[shortcutFor(saved.home, "Home"), shortcutFor(saved.work, "Work")].filter(
              (s): s is { label: string; onPick: () => void } => s !== null,
            )}
            locationData={locationData}
          />
        )}
        {activeTab === "trips" && (
          <TripsSheet
            trips={trips}
            hasLocation={Boolean(locationData)}
            userEmail={auth.user?.email ?? null}
            onStart={handleStartRecording}
            onView={handleViewTrip}
            onDelete={handleDeleteTrip}
            onAddPhoto={handleAddPhoto}
            onRemovePhoto={handleRemovePhoto}
            onSaveToCloud={handleSaveToCloud}
            onAuthenticate={auth.authenticate}
            onSignOut={auth.signOut}
            routeHistory={routeHistory}
            onSelectRoute={handleSelectHistoryRoute}
          />
        )}
        {activeTab === "account" && (
          <AccountSheet
            userEmail={auth.user?.email ?? null}
            onAuthenticate={auth.authenticate}
            onSignOut={auth.signOut}
            onDone={handleCloseSheet}
          />
        )}
        {activeTab === "saved" && (
          <SavedSheet
            home={saved.home}
            work={saved.work}
            favourites={saved.favourites}
            userPosition={locationData ? [locationData.position[0], locationData.position[1]] : null}
            showOnMap={showSavedOnMap}
            syncStatus={{ signedIn: !!auth.user, state: savedSync.state, error: savedSync.error }}
            onToggleShowOnMap={toggleShowSavedOnMap}
            onOpen={handleOpenSaved}
            onRemove={(e) => void saved.remove(e.key)}
          />
        )}
      </BottomSheet>
    </div>
  );
}

export default App;
