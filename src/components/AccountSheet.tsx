import { useState } from "react";
import { UserRound, LogOut, Flag, Trash2 } from "lucide-react";
import type { AuthMode } from "../hooks/useAuth";
import { AuthForm } from "./AuthForm";

interface AccountSheetProps {
  userEmail: string | null;
  onAuthenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
  onSignOut: () => void;
  onDone: () => void;
  /** admins: open the reported trips */
  onShowReports?: () => void;
  /** Deletes the account and everything in it; optionally this device's trips too. */
  onDeleteAccount: (password: string, alsoThisDevice: boolean) => Promise<void>;
}

export function AccountSheet({ userEmail, onAuthenticate, onSignOut, onDone, onShowReports, onDeleteAccount }: AccountSheetProps) {
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  if (deleted) {
    return (
      <div className="flex flex-col gap-3 py-4" role="status">
        <h2 className="font-semibold text-lg text-gray-800">Account deleted</h2>
        <p className="text-sm text-gray-600">
          Your account and everything in it has been removed: trips, photos, shared links, saved places and your
          public name.
        </p>
        <button onClick={onDone} className="py-3 rounded-xl border border-gray-300 font-medium text-gray-800">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <UserRound className="w-5 h-5 text-blue-600" />
        <h2 className="font-semibold text-lg text-gray-800">Account</h2>
      </div>

      {userEmail ? (
        <>
          <p className="text-sm text-gray-700">
            Signed in as <span className="font-medium">{userEmail}</span>.
          </p>
          <p className="text-sm text-gray-500">
            Trips you save to the cloud belong to this account. Trips saved on this
            device stay on this device and never need an account.
          </p>
          {onShowReports && (
            <button
              onClick={onShowReports}
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-700 font-medium"
            >
              <Flag className="w-4 h-4" /> Reported trips
            </button>
          )}
          <button
            onClick={() => {
              onSignOut();
              onDone();
            }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-300 text-gray-800 font-medium"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
          {deleting ? (
            <DeleteAccount
              onCancel={() => setDeleting(false)}
              onDelete={async (password, alsoThisDevice) => {
                await onDeleteAccount(password, alsoThisDevice);
                setDeleted(true);
              }}
            />
          ) : (
            <button onClick={() => setDeleting(true)} className="mt-2 text-sm text-red-600 underline">
              Delete my account
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            You only need an account to save trips to the cloud. Everything else
            works without one.
          </p>
          <AuthForm
            reason="to save your trips to the cloud."
            onAuthenticate={onAuthenticate}
            onSuccess={onDone}
          />
        </>
      )}
    </div>
  );
}

function DeleteAccount({
  onDelete,
  onCancel,
}: {
  onDelete: (password: string, alsoThisDevice: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [alsoThisDevice, setAlsoThisDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      aria-label="Delete account"
      className="rounded-xl border border-red-200 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onDelete(password, alsoThisDevice);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't delete the account");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-semibold text-red-600">Delete your account?</p>
      <p className="mt-1 text-sm text-gray-600">
        This permanently removes your account and everything in it: trips and photos in the cloud, shared and live
        links, saved places, and your public name. It can't be undone. Export any trips you want to keep (GPX) first.
      </p>
      <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={alsoThisDevice} onChange={(e) => setAlsoThisDevice(e.target.checked)} />
        Also remove the trips saved on this device
      </label>
      <input
        type="password"
        required
        autoComplete="current-password"
        aria-label="Your password"
        placeholder="Your password, to confirm"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-800">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !password}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" /> {busy ? "Deleting…" : "Delete forever"}
        </button>
      </div>
    </form>
  );
}
