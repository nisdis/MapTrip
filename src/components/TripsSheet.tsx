import { useState } from "react";
import {
  Circle,
  Square,
  Trash2,
  Cloud,
  Check,
  Route,
  MapPinned,
  Loader2,
  LogOut,
} from "lucide-react";
import type { Trip } from "../types/trip";
import { formatDistance, formatDuration } from "../utils/geo";
import type { AuthMode } from "../hooks/useAuth";

interface TripsSheetProps {
  trips: Trip[];
  isRecording: boolean;
  liveDistanceM: number;
  liveElapsedS: number;
  hasLocation: boolean;
  userEmail: string | null;
  onStart: () => void;
  onStop: () => void;
  onView: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
  onSaveToCloud: (trip: Trip) => Promise<void>;
  onAuthenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
  onSignOut: () => void;
}

export function TripsSheet({
  trips,
  isRecording,
  liveDistanceM,
  liveElapsedS,
  hasLocation,
  userEmail,
  onStart,
  onStop,
  onView,
  onDelete,
  onSaveToCloud,
  onAuthenticate,
  onSignOut,
}: TripsSheetProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Trip waiting for the user to sign in before it is saved to the cloud.
  const [needsLoginFor, setNeedsLoginFor] = useState<Trip | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authBusy, setAuthBusy] = useState(false);

  const saveToCloud = async (trip: Trip) => {
    if (!userEmail) {
      setNeedsLoginFor(trip);
      return;
    }
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

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!needsLoginFor) return;
    setMessage(null);
    setAuthBusy(true);
    try {
      await onAuthenticate(authMode, email.trim(), password);
      // Signed in: finish the save the user originally asked for.
      const trip = needsLoginFor;
      setNeedsLoginFor(null);
      setPassword("");
      setBusyId(trip.id);
      await onSaveToCloud(trip);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setAuthBusy(false);
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="bg-gray-50 rounded-xl p-4">
        {isRecording ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-red-600 font-medium">
                <Circle className="w-3 h-3 fill-red-600 animate-pulse" />
                Recording
              </div>
              <div className="text-sm text-gray-700 tabular-nums">
                {formatDuration(liveElapsedS)} · {formatDistance(liveDistanceM)}
              </div>
            </div>
            <button
              onClick={onStop}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-medium"
            >
              <Square className="w-4 h-4" /> Stop &amp; save trip
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onStart}
              disabled={!hasLocation}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            >
              <Circle className="w-4 h-4" /> Start recording a trip
            </button>
            {!hasLocation && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                Waiting for your location…
              </p>
            )}
          </>
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
        <form
          onSubmit={submitAuth}
          className="bg-blue-50 rounded-xl p-4 space-y-2"
        >
          <p className="text-sm text-gray-800">
            {authMode === "signin" ? "Sign in" : "Create an account"} to save
            “{needsLoginFor.name}” to the cloud. Saving on this device never
            needs an account.
          </p>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-base"
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete={authMode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (8+ characters)"
            className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-base"
          />
          <button
            disabled={authBusy}
            className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
          >
            {authBusy
              ? "Please wait…"
              : authMode === "signin"
                ? "Sign in & save"
                : "Create account & save"}
          </button>
          <div className="flex justify-between text-xs text-gray-500">
            <button
              type="button"
              onClick={() =>
                setAuthMode(authMode === "signin" ? "signup" : "signin")
              }
            >
              {authMode === "signin"
                ? "New here? Create an account"
                : "Have an account? Sign in"}
            </button>
            <button type="button" onClick={() => setNeedsLoginFor(null)}>
              Not now
            </button>
          </div>
        </form>
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
                    ` · ${formatDistance(trip.distanceM)} · ${formatDuration(trip.durationS)}`}
                </div>
              </button>
              <div className="flex items-center justify-between mt-2">
                {trip.cloudSyncedAt ? (
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
                    Save to cloud
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
    </div>
  );
}
