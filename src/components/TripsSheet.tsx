import { useState } from "react";
import {
  Circle,
  Trash2,
  Cloud,
  Check,
  Route,
  MapPinned,
  Loader2,
  LogOut,
  ImagePlus,
} from "lucide-react";
import { PhotoThumb } from "./PhotoThumb";
import { hasUnsyncedPhotos } from "../services/cloudTrips";
import type { Trip } from "../types/trip";
import { formatDistance, formatDuration } from "../utils/geo";
import type { AuthMode } from "../hooks/useAuth";
import { AuthForm } from "./AuthForm";
import type { RouteHistoryItem } from "../services/routeHistoryService";

function maxKmh(trip: Trip): number {
  const max = (trip.track ?? []).reduce((m, p) => Math.max(m, p.speed ?? 0), 0);
  return Math.round(max * 3.6);
}

interface TripsSheetProps {
  trips: Trip[];
  hasLocation: boolean;
  userEmail: string | null;
  onStart: () => void;
  onView: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
  onAddPhoto: (trip: Trip, file: File) => Promise<void>;
  onRemovePhoto: (trip: Trip, photoId: string) => void;
  onSaveToCloud: (trip: Trip) => Promise<void>;
  onAuthenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
  onSignOut: () => void;
  routeHistory: RouteHistoryItem[];
  onSelectRoute: (item: RouteHistoryItem) => void;
}

export function TripsSheet({
  trips,
  hasLocation,
  userEmail,
  onStart,
  onView,
  onDelete,
  onAddPhoto,
  onRemovePhoto,
  onSaveToCloud,
  onAuthenticate,
  onSignOut,
  routeHistory,
  onSelectRoute,
}: TripsSheetProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Trip waiting for the user to sign in before it is saved to the cloud.
  const [needsLoginFor, setNeedsLoginFor] = useState<Trip | null>(null);

  const performSave = async (trip: Trip) => {
    setBusyId(trip.id);
    setMessage(null);
    try {
      await onSaveToCloud(trip);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save to cloud");
    } finally {
      setBusyId(null);
    }
  };

  const saveToCloud = async (trip: Trip) => {
    if (!userEmail) {
      setNeedsLoginFor(trip);
      return;
    }
    await performSave(trip);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <button
          onClick={onStart}
          disabled={!hasLocation}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-milestone text-asphalt font-bold disabled:opacity-50"
        >
          <Circle className="w-4 h-4 fill-signal text-signal" /> Record a trip
        </button>
        {!hasLocation && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            Turn on location to record. Waiting for your position…
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg text-gray-800">
          Saved on this device
        </h2>
        {userEmail && (
          <button
            onClick={onSignOut}
            className="flex items-center gap-1 text-xs text-gray-500"
            title={userEmail}
          >
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        )}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      {needsLoginFor && (
        <AuthForm
          reason={`to save “${needsLoginFor.name}” to the cloud. Saving on this device never needs an account.`}
          onAuthenticate={onAuthenticate}
          onSuccess={async () => {
            // Signed in: finish the save the user originally asked for.
            const trip = needsLoginFor;
            setNeedsLoginFor(null);
            await performSave(trip);
          }}
          onCancel={() => setNeedsLoginFor(null)}
        />
      )}

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <MapPinned className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500">No trips saved yet</p>
          <p className="text-sm text-gray-400">
            Record a trip, or save a route from Directions.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 pb-20">
          {trips.map((trip) => (
            <li key={trip.id} className="bg-gray-50 rounded-xl p-3">
              <button
                onClick={() => onView(trip)}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2 font-medium text-gray-900">
                  {trip.kind === "recorded" ? (
                    <Route className="w-4 h-4 text-purple-600" />
                  ) : (
                    <MapPinned className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="truncate">{trip.name}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(trip.createdAt).toLocaleString()}
                  {trip.kind === "recorded" &&
                    ` · ${formatDistance(trip.distanceM)} · ${formatDuration(trip.durationS)} · max ${maxKmh(trip)} km/h`}
                </div>
              </button>
              <div className="flex items-center gap-2 mt-2 overflow-x-auto">
                {(trip.photos ?? []).map((photo) => (
                  <PhotoThumb
                    key={photo.id}
                    photoId={photo.id}
                    onRemove={() => onRemovePhoto(trip, photo.id)}
                  />
                ))}
                <label className="w-16 h-16 flex-shrink-0 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 text-[10px] cursor-pointer">
                  <ImagePlus className="w-5 h-5" />
                  Add photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        await onAddPhoto(trip, file);
                      } catch (err) {
                        setMessage(
                          err instanceof Error ? err.message : "Couldn't add photo",
                        );
                      }
                    }}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between mt-2">
                {trip.cloudSyncedAt && !hasUnsyncedPhotos(trip) ? (
                  <span className="flex items-center gap-1 text-xs text-green-700">
                    <Check className="w-3 h-3" /> Saved to cloud
                  </span>
                ) : (
                  <button
                    onClick={() => saveToCloud(trip)}
                    disabled={busyId === trip.id}
                    className="flex items-center gap-1 text-xs text-blue-600"
                  >
                    {busyId === trip.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Cloud className="w-3 h-3" />
                    )}
                    {trip.cloudSyncedAt ? "Update cloud copy" : "Save to cloud"}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm(`Delete “${trip.name}” from this device?`))
                      onDelete(trip);
                  }}
                  className="p-1 text-gray-400 hover:text-red-600"
                  aria-label="Delete trip"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {routeHistory.length > 0 && (
        <section className="pb-20">
          <h2 className="mb-2 font-semibold text-lg text-gray-800">Recent routes</h2>
          <ul className="space-y-2">
            {routeHistory.slice(0, 10).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectRoute(item)}
                  className="w-full rounded-xl bg-gray-50 p-3 text-left hover:bg-gray-100"
                >
                  <div className="truncate font-medium text-gray-900">{item.origin.name}</div>
                  <div className="truncate text-sm text-gray-500">
                    to {item.destination.name} · {new Date(item.timestamp).toLocaleDateString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
