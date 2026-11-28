import { Loader2 } from "lucide-react";
import { useVideoProgress } from "../services/videoShrink";

/** "Preparing video… 40%" while a video is being made smaller on the phone. */
export function VideoProgress() {
  const p = useVideoProgress();
  if (!p) return null;
  const pct = Math.round(p.fraction * 100);
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <p className="flex items-center gap-2 rounded-full bg-asphalt/90 px-4 py-2 text-sm font-semibold text-paper shadow-lg">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Preparing video… {pct}%
      </p>
    </div>
  );
}
