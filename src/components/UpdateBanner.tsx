import { RefreshCw } from "lucide-react";
import { reloadNow, useUpdateReady } from "../swUpdate";

/** "New version ready": shown only when reloading won't interrupt a trip. */
export function UpdateBanner() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-asphalt py-1.5 pl-4 pr-1.5 text-sm text-paper shadow-lg">
        A new version of the app is ready.
        <button type="button" onClick={reloadNow} className="flex items-center gap-1.5 rounded-full bg-highway px-3 py-1.5 font-bold text-white">
          <RefreshCw className="h-3.5 w-3.5" /> Reload
        </button>
      </div>
    </div>
  );
}
