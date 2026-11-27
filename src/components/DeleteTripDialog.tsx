import { Smartphone, Trash2 } from "lucide-react";
import type { Trip } from "../types/trip";

export type DeleteScope = "device" | "everywhere";

interface DeleteTripDialogProps {
  trip: Trip;
  /** in the signed-in account: offer This phone only / Everywhere */
  inAccount: boolean;
  onChoose: (scope: DeleteScope) => void;
  onCancel: () => void;
}

/** Deleting a trip: from this phone only, or everywhere (when it's in your account). */
export function DeleteTripDialog({ trip, inAccount, onChoose, onCancel }: DeleteTripDialogProps) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete trip"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-[#1c2429]"
      >
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Delete “{trip.name}”?</h2>
        {inAccount ? (
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => onChoose("device")}
              className="flex w-full items-start gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50 dark:border-gray-600"
            >
              <Smartphone aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-600" />
              <span>
                <span className="block font-medium text-gray-900 dark:text-gray-100">This phone only</span>
                <span className="block text-xs text-gray-500">Frees space. It stays in your account and downloads again if you open it.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChoose("everywhere")}
              className="flex w-full items-start gap-3 rounded-xl border border-red-200 p-3 text-left hover:bg-red-50 dark:border-red-900"
            >
              <Trash2 aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <span>
                <span className="block font-medium text-red-700">Everywhere</span>
                <span className="block text-xs text-gray-500">
                  From your account and all your devices, with its photos. If it's shared, the link stops working and it
                  leaves Explore. Can't be undone.
                </span>
              </span>
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">It's only on this phone, so it will be gone for good.</p>
            <button
              type="button"
              onClick={() => onChoose("device")}
              className="mt-3 w-full rounded-xl bg-red-600 py-2.5 font-medium text-white"
            >
              Delete
            </button>
          </div>
        )}
        <button type="button" onClick={onCancel} className="mt-2 w-full py-2 text-sm text-gray-600 dark:text-gray-300">
          Cancel
        </button>
      </div>
    </div>
  );
}
