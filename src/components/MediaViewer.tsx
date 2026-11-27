import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { usePhotoUrl } from "../services/photoStore";
import { isVideo, type TripPhoto } from "../types/trip";

interface MediaViewerProps {
  /** what to step through (e.g. everything taken at one spot) */
  items: TripPhoto[];
  start?: number;
  onClose: () => void;
}

/** Trip photos and videos, full screen, one at a time. */
export function MediaViewer({ items, start = 0, onClose }: MediaViewerProps) {
  const [i, setI] = useState(Math.min(start, items.length - 1));
  const media = items[i];
  const url = usePhotoUrl(media);
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => (x + 1) % items.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, items.length]);
  const when = media.takenAt ? new Date(media.takenAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isVideo(media) ? "Video" : "Photo"}
      className="fixed inset-0 z-[3000] flex flex-col bg-black"
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm text-white/80">
        <span>
          {when}
          {items.length > 1 && <span className="ml-2 text-white/60">{i + 1} of {items.length}</span>}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-white hover:bg-white/10">
          <X aria-hidden className="h-6 w-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <Loader2 aria-label="Loading" className="h-8 w-8 animate-spin text-white/70" />
        ) : isVideo(media) ? (
          <video key={media.id} src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : (
          <img key={media.id} src={url} alt="Trip photo" className="max-h-full max-w-full object-contain" />
        )}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
            >
              <ChevronLeft aria-hidden className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
            >
              <ChevronRight aria-hidden className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
