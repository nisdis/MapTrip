import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup } from "react-leaflet";
import { NearbyMarkers } from "./components/NearbyMarkers";
import { VectorBasemap } from "./components/VectorBasemap";
import { Map as MapIcon, Wifi, WifiOff, UserRound, Menu } from "lucide-react";
import { MapControls } from "./components/MapControls";
import { MapController } from "./components/MapController";
import { RouteControl } from "./components/RouteControl";
import { RouteBar } from "./components/RouteBar";
import { importAll } from "./services/mediaImport";
import { placeMedia } from "./utils/media";
import { useRecordingMedia } from "./hooks/useRecordingMedia";
import { MediaPins } from "./components/MediaPins";
import { MediaViewer } from "./components/MediaViewer";
import type { DeleteScope } from "./components/DeleteTripDialog";
import { loadTravelMode, saveTravelMode, type TravelMode } from "./services/travelMode";
import { endResult, pathCoords, savedRouteFrom, type FoundRoute } from "./services/savedRoutes";
import { routeFromPlanned } from "../api/_lib/plannedRoute";
import { CurrentLocationMarker } from "./components/CurrentLocationMarker";
import { SpeedPill } from "./components/SpeedPill";
import { useLocationTracking } from "./hooks/useLocationTracking";
import { setupLeaflet } from "./utils/leaflet-setup";
import { getRouteHistory } from "./services/routeHistoryService";
import type { SearchResult } from "./services/searchService";
import type { RouteHistoryItem } from "./services/routeHistoryService";
import { BottomSheet } from "./components/BottomSheet";
import { RecordButton } from "./components/RecordButton";
import { SideMenu } from "./components/SideMenu";
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
import { clearDraft, loadDraft } from "./services/draftStore";
import { callApp, isInApp, saveTextFile, type NativeFix, type NativeHello } from "./services/appBridge";
import { gpxFileName, parseGpx, toGpx } from "./utils/gpx";
import { computeStats } from "./utils/tripStats";
import { useTripRecorder } from "./hooks/useTripRecorder";
import { useLiveShare } from "./hooks/useLiveShare";
import { LiveShareSheet } from "./components/LiveShareSheet";
import { BatteryGuide } from "./components/BatteryGuide";
import { TripShareSheet } from "./components/TripShareSheet";
import { ExploreSheet } from "./components/ExploreSheet";
import { ExploreLayer } from "./components/ExploreLayer";
import { ExploreCard } from "./components/ExploreCard";
import { OfflineMapsSheet } from "./components/OfflineMapsSheet";
import { ReportsSheet } from "./components/ReportsSheet";
import { StatsSheet } from "./components/StatsSheet";
import { PeopleSheet } from "./components/PeopleSheet";
import { getPeople } from "./services/social";
import { exploreArea, getMe, type ExploreTrip, type NearestTrip } from "./services/publicTrips";
import { useAuth } from "./hooks/useAuth";
import { needsSync, useTripSync } from "./hooks/useTripSync";
import { authClient } from "./services/authClient";
import {
  deleteLocalTrip,
  listLocalTrips,
  newTripId,
  saveTripLocally,
} from "./services/tripStore";
import { deleteCloudTrip, fetchCloudTrip, queueDelete, saveTripToCloud } from "./services/cloudTrips";
import { deletePhotoBlob } from "./services/photoStore";
import type { Trip, TripPhoto } from "./types/trip";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { LatLngTuple } from "leaflet";
import { setUpdateBusy, useUpdateReady } from "./swUpdate";
import { track } from "./services/usage";

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
  const [travelMode, setTravelMode] = useState<TravelMode>(loadTravelMode);
  // Photos/videos added during the recording in progress (kept across a reload).
  const [recordingMedia, setRecordingMedia] = useRecordingMedia();
  // The photo or video open full screen.
  const [viewingMedia, setViewingMedia] = useState<{ items: TripPhoto[]; start: number } | null>(null);
  const openMedia = useCallback((items: TripPhoto[], start: number) => setViewingMedia({ items, start }), []);
  // The route Directions found (to save it), and a saved route's stored path,
  // drawn until a fresh route arrives (or for good, offline).
  const [foundRoute, setFoundRoute] = useState<FoundRoute | null>(null);
  // Directions only asks the routing server once you tap Show route.
  const [routeShown, setRouteShown] = useState(false);
  const [storedPath, setStoredPath] = useState<[number, number][] | null>(null);
  const [destination, setDestination] = useState<SearchResult | null>(null);
  const { locationData, error, subscribe, attachApp } = useLocationTracking();
  const hasCenteredOnUser = useRef(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [viewTrip, setViewTrip] = useState<Trip | null>(null);
  const recorder = useTripRecorder(subscribe);
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
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Follow requests waiting (badge on More); checked on sign-in and when the app comes back.
  const [requestCount, setRequestCount] = useState(0);
  useEffect(() => {
    if (!auth.user) {
      setRequestCount(0);
      return;
    }
    const check = () =>
      getPeople()
        .then((p) => setRequestCount(p.requests.length))
        .catch(() => undefined);
    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [auth.user]);
  useEffect(() => {
    if (!auth.user) {
      setIsAdmin(false);
      return;
    }
    getMe()
      .then((m) => setIsAdmin(m.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [auth.user]);

  // Explore: public trips through the area on the map.
  const [explore, setExplore] = useState<{
    trips: ExploreTrip[] | null;
    nearest: NearestTrip[];
    loading: boolean;
    error: string | null;
    stale: boolean;
  }>({ trips: null, nearest: [], loading: false, error: null, stale: false });
  // Explore mode: public trips drawn on the map (until the Explore chip is tapped again).
  const [exploring, setExploring] = useState(false);
  const [exploreSelected, setExploreSelected] = useState<string | null>(null);
  const [exploreFocus, setExploreFocus] = useState<{ bbox: [number, number, number, number]; key: number } | null>(null);
  const reloadAfterMove = useRef(false);
  // The app moved the map to show a trip: that isn't "the area changed".
  const quietMove = useRef(false);
  const loadExplore = useCallback(async () => {
    const b = boundsRef.current;
    if (!b) return;
    setExplore((e) => ({ ...e, loading: true, error: null }));
    try {
      const r = await exploreArea(b);
      setExplore({ trips: r.trips, nearest: r.nearest ?? [], loading: false, error: null, stale: false });
    } catch (e) {
      setExplore((x) => ({ ...x, loading: false, error: e instanceof Error ? e.message : "Couldn't load trips" }));
    }
  }, []);
  const focusOn = useCallback((bbox: [number, number, number, number]) => {
    setExploreFocus({ bbox, key: Date.now() });
  }, []);
  const startExplore = useCallback(() => {
    track("explore_opened");
    setShowMoreMenu(false);
    setExploring(true);
    setExploreSelected(null);
    setActiveTab("explore");
    setShowSheet(true);
    void loadExplore();
  }, [loadExplore]);
  const stopExplore = useCallback(() => {
    setExploring(false);
    setExploreSelected(null);
    setActiveTab((t) => {
      if (t === "explore") setShowSheet(false);
      return t;
    });
  }, []);
  const lineBox = (t: ExploreTrip): [number, number, number, number] => {
    const lats = t.line.map((p) => p[0]);
    const lngs = t.line.map((p) => p[1]);
    return [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)];
  };

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

  // Removes a trip from this device only (with its photos).
  const removeLocalTrip = useCallback(async (trip: Trip) => {
    await Promise.all((trip.photos ?? []).map((p) => deletePhotoBlob(p.id)));
    await deleteLocalTrip(trip.id);
  }, []);

  // Signed in: the Trips list is the account's, on every device (up and down).
  const tripSync = useTripSync(trips, auth.user?.id ?? null, {
    save: saveTripLocally,
    remove: removeLocalTrip,
    refresh: refreshTrips,
  });

  // Planned trips from older versions are routes, not trips: move them to Saved
  // (same key as the server's own conversion, so no duplicates).
  const movingPlanned = useRef(false);
  useEffect(() => {
    const planned = trips.filter((t) => t.kind === "planned");
    if (!saved.loaded || !planned.length || movingPlanned.current) return;
    movingPlanned.current = true;
    void (async () => {
      for (const t of planned) {
        const entry = routeFromPlanned(t);
        if (entry) await saved.saveRoute(entry.route, t.id);
        await removeLocalTrip(t);
      }
      await refreshTrips();
      movingPlanned.current = false;
    })();
  }, [trips, saved, removeLocalTrip, refreshTrips]);

  // Signing out: trips already safe in the account leave this device (they
  // come back on sign-in), so the next person using it doesn't see them.
  // Trips not uploaded yet stay, still marked as this account's.
  const signOut = useCallback(async () => {
    const me = auth.user?.id;
    await auth.signOut();
    if (!me) return;
    for (const t of await listLocalTrips()) {
      if (t.ownerId === me && t.cloudSyncedAt && !needsSync(t)) await removeLocalTrip(t);
    }
    setViewTrip(null);
    await refreshTrips();
  }, [auth, removeLocalTrip, refreshTrips]);

  const isRecorderActive = recorder.status !== "idle";
  const isLive = recorder.status === "recording" || recorder.status === "paused";
  const updateReady = useUpdateReady();
  // A new version of the app never reloads the page in the middle of a trip.
  useEffect(() => setUpdateBusy(isRecorderActive), [isRecorderActive]);
  // While recording, the map follows you until you drag it away.
  const [follow, setFollow] = useState(true);
  const [pocket, setPocket] = useState(false);
  const estimatedM = gapDistance(recorder.gaps);
  const liveShare = useLiveShare({
    status: recorder.status,
    startedAt: recorder.startedAt,
    track: recorder.track,
    stats: {
      distanceM: recorder.distanceM,
      estimatedM,
      maxSpeedMs: recorder.maxSpeedMs,
      speedMs: recorder.speedMs,
      altitudeM: recorder.altitudeM,
      activeSeconds: recorder.activeSeconds,
    },
  });
  const [showLiveShare, setShowLiveShare] = useState(false);
  const [selectedGap, setSelectedGap] = useState<number | null>(null);

  // ---- Inside the Record My Trip app (GPS and background recording by the app) ----
  const [appReady, setAppReady] = useState(() => !isInApp());
  const appPending = useRef<NativeFix[] | null>(null);
  const [appHello, setAppHello] = useState<NativeHello | null>(null);
  const [showBattery, setShowBattery] = useState(false);
  useEffect(() => {
    if (!isInApp()) return;
    let cancelled = false;
    void (async () => {
      const hello = await callApp<NativeHello>({ type: "hello" });
      if (cancelled) return;
      setAppHello(hello);
      // The page was reloaded while the app kept recording: carry the trip on.
      if (hello && hello.recording !== "idle") {
        const d = await loadDraft().catch(() => null);
        if (cancelled) return;
        if (d) {
          recorder.continueDraft(d, hello.recording);
          liveShare.adoptOrCleanUp(hello.share);
          appPending.current = hello.pending; // replayed once the recorder has picked up
          setAppReady(true);
          return;
        }
      }
      liveShare.adoptOrCleanUp(null);
      attachApp(hello?.pending ?? []);
      setAppReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (appPending.current && (recorder.status === "recording" || recorder.status === "paused")) {
      attachApp(appPending.current);
      appPending.current = null;
    }
  }, [recorder.status, attachApp]);
  // First trip in the app while Android may still stop it in the background:
  // explain how to let it run (once; it stays reachable from the recorder).
  const batteryRestricted = appHello?.device?.os === "android" && appHello.battery?.unrestricted === false;
  useEffect(() => {
    if (recorder.status !== "recording" || !batteryRestricted) return;
    try {
      if (localStorage.getItem("batteryGuideSeen")) return;
      localStorage.setItem("batteryGuideSeen", "1");
    } catch {
      /* show it anyway */
    }
    setShowBattery(true);
  }, [recorder.status, batteryRestricted]);

  // The app records in the background only while a trip is being recorded.
  useEffect(() => {
    if (!appReady || !isInApp()) return;
    const state = recorder.status === "recording" || recorder.status === "paused" ? recorder.status : "idle";
    void callApp({ type: "recording", state, startedAt: recorder.startedAt });
  }, [appReady, recorder.status, recorder.startedAt]);
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
        ...(auth.user ? { ownerId: auth.user.id } : {}),
        track: recorder.track,
        gaps: recorder.gaps,
        // Total includes the estimated stretches; they're kept in `gaps` so the
        // measured part can always be told apart.
        distanceM: stats.distanceM + gapDistance(recorder.gaps),
        durationS: recorder.activeSeconds,
        // Ones added before their place on the route was recorded get it now.
        ...(recordingMedia.length ? { photos: placeMedia(recordingMedia, recorder.track) } : {}),
      };
      await persistTrip(trip);
      track("trip_recorded");
      setRecordingMedia([]);
      recorder.reset();
      setViewTrip(trip);
    },
    [recorder, persistTrip, auth.user, recordingMedia, setRecordingMedia],
  );

  const handleDiscardRecordedTrip = useCallback(() => {
    setPocket(false);
    void Promise.all(recordingMedia.map((m) => deletePhotoBlob(m.id)));
    setRecordingMedia([]);
    recorder.reset();
  }, [recorder, recordingMedia, setRecordingMedia]);

  // Photos and videos while recording: pinned where you are (or, from the
  // gallery, where the route was when they were taken).
  const handleAddRecordingMedia = useCallback(
    async (files: File[]) => {
      const { added, errors } = await importAll(files, recorder.track);
      if (added.length) {
        setRecordingMedia((m) => [...m, ...added]);
        track("media_added");
      }
      if (errors.length) alert(errors.join("\n"));
    },
    [recorder.track, setRecordingMedia],
  );

  const handleFinishRecording = useCallback(() => {
    setPocket(false);
    if (recorder.track.length < 2) {
      recorder.reset();
      alert("That trip was too short to save. Move a little before finishing.");
      return;
    }
    recorder.finish();
  }, [recorder]);

  // Directions → Saved (a route isn't a trip: it was worked out, not travelled).
  const handleSaveRoute = useCallback(async () => {
    if (!origin || !destination) return;
    await saved.saveRoute(savedRouteFrom(origin, destination, travelMode, foundRoute));
    track("route_saved");
  }, [origin, destination, travelMode, foundRoute, saved]);

  // Is what Directions shows (both ends and the mode) already in Saved › Routes?
  const routeIsSaved = useMemo(() => {
    if (!origin || !destination) return false;
    const near = (a: { lat: number; lng: number }, b: LatLngTuple) =>
      Math.abs(a.lat - b[0]) < 1e-5 && Math.abs(a.lng - b[1]) < 1e-5;
    return saved.routes.some(
      (e) => e.route && e.route.mode === travelMode && near(e.route.from, origin.location) && near(e.route.to, destination.location),
    );
  }, [saved.routes, origin, destination, travelMode]);

  const handleOpenRoute = useCallback((entry: SavedEntry) => {
    const r = entry.route;
    if (!r) return;
    setViewTrip(null);
    setOrigin(endResult(r.from));
    setDestination(endResult(r.to));
    setTravelMode(r.mode);
    const coords = pathCoords(r.path);
    setStoredPath(coords.length >= 2 ? coords : null);
    setRouteShown(true);
    setCenter([r.from.lat, r.from.lng]);
    setActiveTab("directions");
    setShowSheet(true);
  }, []);

  const handleViewTrip = useCallback(
    async (trip: Trip) => {
      if (trip.kind === "planned" && trip.origin && trip.destination) {
        setViewTrip(null);
        setOrigin(trip.origin);
        setDestination(trip.destination);
        setActiveTab("directions");
        return;
      }
      if (trip.summaryOnly) {
        // From another device: download it once; then it's on this one too.
        try {
          const full = { ...(await fetchCloudTrip(trip.id)), ownerId: trip.ownerId };
          await persistTrip(full);
          trip = full;
        } catch (e) {
          alert(e instanceof Error ? e.message : "Couldn't open the trip");
          return;
        }
      }
      setViewTrip(trip);
      setShowSheet(false);
    },
    [persistTrip],
  );

  // Delete from this phone only, or everywhere: the account, other devices,
  // the share link and Explore (offline, the account part is sent later).
  const handleDeleteTrip = useCallback(
    async (trip: Trip, scope: DeleteScope) => {
      const inAccount = !!trip.cloudSyncedAt && !!auth.user && (!trip.ownerId || trip.ownerId === auth.user.id);
      if (inAccount && scope === "everywhere") {
        try {
          await deleteCloudTrip(trip.id);
        } catch {
          queueDelete(trip.id);
        }
      }
      await removeLocalTrip(trip);
      setViewTrip((v) => (v?.id === trip.id ? null : v));
      await refreshTrips();
    },
    [auth.user, removeLocalTrip, refreshTrips],
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

  // Photos and videos added to a saved trip: pinned on its route by when they were taken.
  const handleAddPhoto = useCallback(
    async (trip: Trip, files: File[]) => {
      const { added, errors } = await importAll(files, trip.track ?? []);
      if (added.length) {
        await persistTrip({ ...trip, photos: [...(trip.photos ?? []), ...added] });
        track("media_added");
      }
      if (errors.length) throw new Error(errors.join("\n"));
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
  const handleBoundsChange = useCallback(
    (b: Bounds) => {
      boundsRef.current = b;
      // Flew to a trip from "nearest": list what's there once the map has arrived.
      if (reloadAfterMove.current) {
        reloadAfterMove.current = false;
        void loadExplore();
        return;
      }
      if (quietMove.current) {
        quietMove.current = false;
        return;
      }
      setExplore((e) => (e.trips && !e.stale ? { ...e, stale: true } : e));
    },
    [loadExplore],
  );

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
      if (entry.kind === "route") return handleOpenRoute(entry);
      setShowSheet(false);
      nearby.clear();
      placeLookup.openKnown(entry.place);
      setCenter([entry.place.lat, entry.place.lng]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placeLookup.openKnown, nearby.clear, handleOpenRoute],
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
    setStoredPath(null);
    setRouteShown(false);
    setOrigin(result);
    setCenter(result?.location);
    setZoom(15);
  }, []);

  const handleSelectDestination = useCallback((result: SearchResult) => {
    setStoredPath(null);
    setRouteShown(false);
    setDestination(result);
    setCenter(result?.location);
    setZoom(15);
  }, []);

  const handleClearDirections = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    setStoredPath(null);
    setRouteShown(false);
    setFoundRoute(null);
    setIsVisible(false);
  }, []);

  const handleSelectHistoryRoute = useCallback(
    (historyItem: RouteHistoryItem) => {
      setStoredPath(null);
      setRouteShown(true);
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
    if (tab === "directions") {
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

  const handleShoeRouteItems = useCallback(() => {
    setIsVisible((visible) => !visible);
  }, []);
  if (!isMapReady) {
    return null;
  }

  return (
    <div className="h-screen w-screen relative bg-gray-100">
      {!isRecorderActive && (
      <div className="absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-paper/90 to-transparent p-4 pointer-events-none">
        <div className="max-w-7xl mx-auto pointer-events-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleMore}
              aria-label="Menu"
              aria-expanded={showMoreMenu}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt"
            >
              <Menu aria-hidden className="h-5 w-5 text-gray-800" />
              {(requestCount > 0 || updateReady) && (
                <span aria-hidden className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-white" />
              )}
            </button>
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

      {origin && destination && routeShown && !isRecorderActive && !showSheet && !placeLookup.target && !nearby.state && !exploring && (
        <RouteBar
          origin={origin}
          destination={destination}
          mode={travelMode}
          found={foundRoute}
          stepsShown={isVisible}
          onToggleSteps={handleShoeRouteItems}
          onClear={handleClearDirections}
          isSaved={routeIsSaved}
          onSave={() => void handleSaveRoute()}
        />
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
        <MapTapHandler disabled={isRecorderActive || exploring} onTap={handleMapTap} />
        {exploring && !isRecorderActive && (
          <ExploreLayer
            trips={explore.trips ?? []}
            selectedId={exploreSelected}
            focus={exploreFocus}
            onSelect={(t) => {
              setExploreSelected(t.id);
              setShowSheet(false);
            }}
          />
        )}
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
            onGapTap={recorder.status === "review" ? setSelectedGap : undefined}
            selectedGap={recorder.status === "review" ? selectedGap : null}
          />
        ) : (
          viewTrip?.track && (
            <TripLayer track={viewTrip.track} gaps={viewTrip.gaps} fitKey={viewTrip.id} showEnds />
          )
        )}
        {isRecorderActive ? (
          <MediaPins media={placeMedia(recordingMedia, recorder.track)} onOpen={openMedia} />
        ) : (
          !!viewTrip?.photos?.length && <MediaPins media={viewTrip.photos} onOpen={openMedia} />
        )}
        {origin && destination && routeShown && storedPath && (
          <Polyline positions={storedPath} pathOptions={{ color: "#2E75CC", opacity: 0.6, weight: 4, dashArray: "6 6" }} />
        )}
        {origin && destination && routeShown && (
          <RouteControl
            origin={origin}
            destination={destination}
            isVisible={isVisible}
            mode={travelMode}
            onRoute={(r) => {
              setFoundRoute(r);
              if (r) setStoredPath(null); // a fresh route replaces the saved one
            }}
          />
        )}
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
        />
      </MapContainer>

      {!isRecorderActive && !placeLookup.target && !nearby.state && (
        <SpeedPill locationData={locationData} />
      )}

      {!isRecorderActive && (
        <CategoryChips
          activeId={nearby.state?.category.id ?? null}
          onSelect={handleSelectCategory}
          exploring={exploring}
          onExplore={() => (exploring ? stopExplore() : startExplore())}
        />
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

      {!isRecorderActive && <RecordButton onRecord={handleStartRecording} />}

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
          sharing={!!liveShare.share}
          onShare={() => setShowLiveShare(true)}
          onBatteryHelp={batteryRestricted ? () => setShowBattery(true) : undefined}
          mediaCount={recordingMedia.length}
          onAddMedia={(files) => void handleAddRecordingMedia(files)}
        />
      )}

      {showBattery && (
        <BatteryGuide
          manufacturer={appHello?.device?.manufacturer ?? ""}
          onClose={() => {
            setShowBattery(false);
            // It may have been changed in settings: ask again.
            void callApp<{ unrestricted: boolean }>({ type: "batteryStatus" }).then(
              (r) => r && setAppHello((h) => (h ? { ...h, battery: { unrestricted: r.unrestricted } } : h)),
            );
          }}
        />
      )}

      {showLiveShare && isLive && (
        <LiveShareSheet
          signedIn={!!auth.user}
          share={liveShare.share}
          lastSyncAt={liveShare.lastSyncAt}
          problem={liveShare.problem}
          onAuthenticate={auth.authenticate}
          onStart={liveShare.start}
          onExtend={liveShare.extend}
          onStop={liveShare.stop}
          onClose={() => setShowLiveShare(false)}
        />
      )}

      {liveShare.endedNotice && (
        <div
          role="alert"
          className="fixed top-4 inset-x-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-asphalt px-4 py-3 font-hud text-sm text-paper shadow-lg"
        >
          <span className="flex-1">{liveShare.endedNotice}</span>
          <button type="button" onClick={liveShare.dismissNotice} className="font-bold underline">
            OK
          </button>
        </div>
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
          gaps={recorder.gaps}
          selectedGap={selectedGap}
          onSelectGap={setSelectedGap}
          onSetGapFill={recorder.setGapFill}
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
          className="fixed top-4 left-1/2 -translate-x-1/2 z-20 rounded-full bg-asphalt px-5 py-3 font-hud text-sm font-bold text-paper shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Recenter on me
        </button>
      )}

      {exploring && !isRecorderActive && !showSheet && (() => {
        const t = explore.trips?.find((x) => x.id === exploreSelected);
        return t ? (
          <ExploreCard
            trip={t}
            onOpen={() => window.location.assign(`/t/${t.id}`)}
            onList={() => {
              setActiveTab("explore");
              setShowSheet(true);
            }}
            onClose={() => setExploreSelected(null)}
          />
        ) : null;
      })()}

      {exploring && !isRecorderActive && explore.stale && (
        <button
          type="button"
          onClick={() => void loadExplore()}
          className="fixed left-1/2 top-[7.5rem] z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-highway px-4 py-2 text-sm font-bold text-white shadow-lg"
        >
          Search this area
        </button>
      )}

      {!isOnline && !isRecorderActive && (
        <div
          role="status"
          className="pointer-events-none fixed left-4 right-20 top-[7.75rem] z-20 flex justify-start"
        >
          <p className="flex max-w-md items-start gap-2 rounded-xl bg-asphalt/90 px-3 py-2 text-xs text-paper shadow-lg">
            <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              <b>You're offline.</b> Recording, your trips and saved maps work. Search, directions and sharing
              wait for a connection; trips back up when you're online.
            </span>
          </p>
        </div>
      )}

      <SideMenu
        isOpen={showMoreMenu}
        onClose={handleCloseMore}
        onOpen={(panel) => {
          setShowMoreMenu(false);
          handleTabChange(panel);
        }}
        activePanel={showSheet ? activeTab : exploring ? "explore" : null}
        signedIn={!!auth.user}
        userId={auth.user?.id ?? null}
        onExplore={startExplore}
        onPeople={() => {
          setShowMoreMenu(false);
          setActiveTab("people");
          setShowSheet(true);
        }}
        peopleBadge={requestCount}
        onOfflineMaps={() => {
          setShowMoreMenu(false);
          setActiveTab("offline");
          setShowSheet(true);
        }}
      />

      {shareTrip && <TripShareSheet trip={shareTrip} onClose={() => setShareTrip(null)} />}
      {showReports && <ReportsSheet onClose={() => setShowReports(false)} />}
      {showStats && <StatsSheet onClose={() => setShowStats(false)} />}

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
            onSaveRoute={handleSaveRoute}
            routeIsSaved={routeIsSaved}
            routeShown={routeShown}
            onShowRoute={() => {
              track("route_shown");
              setRouteShown(true);
              setShowSheet(false); // see it on the map
            }}
            near={
              locationData
                ? [locationData.position[0], locationData.position[1]]
                : boundsRef.current
                  ? [(boundsRef.current.south + boundsRef.current.north) / 2, (boundsRef.current.west + boundsRef.current.east) / 2]
                  : [center[0], center[1]]
            }
            routeHistory={routeHistory}
            onSelectRoute={handleSelectHistoryRoute}
            shortcuts={[shortcutFor(saved.home, "Home"), shortcutFor(saved.work, "Work")].filter(
              (s): s is { label: string; onPick: () => void } => s !== null,
            )}
            locationData={locationData}
            mode={travelMode}
            onModeChange={(m) => {
              setTravelMode(m);
              saveTravelMode(m);
            }}
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
            onOpenMedia={openMedia}
            onSaveToCloud={handleSaveToCloud}
            onShare={setShareTrip}
            autoSync={{ ...tripSync, isOnline }}
            onExportGpx={(trip) => void saveTextFile(gpxFileName(trip), "application/gpx+xml", toGpx(trip))}
            onImportGpx={async (file) => {
              if (file.size > 30_000_000) throw new Error("That file is too large to import.");
              const parsed = parseGpx(await file.text(), file.name, newTripId());
              const trip = auth.user ? { ...parsed, ownerId: auth.user.id } : parsed;
              await persistTrip(trip);
              setShowSheet(false);
              setViewTrip(trip);
            }}
            onAuthenticate={auth.authenticate}
            onSignOut={signOut}
          />
        )}
        {activeTab === "people" && <PeopleSheet signedIn={!!auth.user} onRequestsChanged={setRequestCount} />}
        {activeTab === "offline" && (
          <OfflineMapsSheet
            bounds={boundsRef.current}
            isOnline={isOnline}
            onShowArea={(b) => {
              setShowSheet(false);
              setCenter([(b.north + b.south) / 2, (b.east + b.west) / 2]);
              setZoom(13);
            }}
          />
        )}
        {activeTab === "explore" && (
          <ExploreSheet
            trips={explore.trips}
            loading={explore.loading}
            error={explore.error}
            stale={explore.stale}
            selectedId={exploreSelected}
            onRefresh={() => void loadExplore()}
            onSelect={(t) => {
              // Show it on the map first; the card opens it.
              setExploreSelected(t.id);
              setShowSheet(false);
              quietMove.current = true;
              focusOn(lineBox(t));
            }}
            nearest={explore.nearest}
            onGoTo={(t) => {
              reloadAfterMove.current = true;
              setShowSheet(false);
              focusOn(t.bbox);
            }}
          />
        )}
        {activeTab === "account" && (
          <AccountSheet
            onShowReports={isAdmin ? () => setShowReports(true) : undefined}
            onShowStats={isAdmin ? () => setShowStats(true) : undefined}
            onDeleteAccount={async (password, alsoThisDevice) => {
              let res: Response;
              try {
                res = await fetch("/api/account", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "delete", password }),
                });
              } catch {
                throw new Error("You're offline. Deleting your account needs a connection.");
              }
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(body.message || "Couldn't delete the account");
              if (alsoThisDevice) {
                for (const t of await listLocalTrips()) {
                  await Promise.all((t.photos ?? []).map((p) => deletePhotoBlob(p.id)));
                  await deleteLocalTrip(t.id);
                }
              } else {
                // Kept on this device, but no longer linked to an account.
                for (const t of await listLocalTrips()) {
                  if (t.cloudSyncedAt) await saveTripLocally({ ...t, cloudSyncedAt: undefined, photos: t.photos?.map((p) => ({ id: p.id, addedAt: p.addedAt })) });
                }
              }
              await authClient.signOut().catch(() => undefined);
              await refreshTrips();
            }}
            userEmail={auth.user?.email ?? null}
            onAuthenticate={auth.authenticate}
            onSignOut={signOut}
            onDone={handleCloseSheet}
          />
        )}
        {activeTab === "saved" && (
          <SavedSheet
            home={saved.home}
            work={saved.work}
            favourites={saved.favourites}
            routes={saved.routes}
            userPosition={locationData ? [locationData.position[0], locationData.position[1]] : null}
            showOnMap={showSavedOnMap}
            syncStatus={{ signedIn: !!auth.user, state: savedSync.state, error: savedSync.error }}
            onToggleShowOnMap={toggleShowSavedOnMap}
            onOpen={handleOpenSaved}
            onRemove={(e) => void saved.remove(e.key)}
          />
        )}
      </BottomSheet>
      {viewingMedia && (
        <MediaViewer items={viewingMedia.items} start={viewingMedia.start} onClose={() => setViewingMedia(null)} />
      )}
    </div>
  );
}

export default App;
