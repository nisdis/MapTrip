import { UserRound, LogOut, Flag } from "lucide-react";
import type { AuthMode } from "../hooks/useAuth";
import { AuthForm } from "./AuthForm";

interface AccountSheetProps {
  userEmail: string | null;
  onAuthenticate: (mode: AuthMode, email: string, password: string) => Promise<void>;
  onSignOut: () => void;
  onDone: () => void;
  /** admins: open the reported trips */
  onShowReports?: () => void;
}

export function AccountSheet({ userEmail, onAuthenticate, onSignOut, onDone, onShowReports }: AccountSheetProps) {
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
