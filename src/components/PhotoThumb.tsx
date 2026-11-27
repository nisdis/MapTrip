import { Play, X } from "lucide-react";
import { usePhotoUrl } from "../services/photoStore";
import { isVideo, type TripPhoto } from "../types/trip";

interface PhotoThumbProps {
  photo: TripPhoto;
  onOpen: () => void;
  onRemove: () => void;
}

/** A trip's photo or video, small; tap to open it. */
export function PhotoThumb({ photo, onOpen, onRemove }: PhotoThumbProps) {
  const url = usePhotoUrl(photo);
  const video = isVideo(photo);
  return (
    <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
      <button type="button" onClick={onOpen} aria-label={video ? "Play video" : "Open photo"} className="block h-full w-full">
        {url &&
          (video ? (
            <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : (
            <img src={url} alt="Trip photo" className="h-full w-full object-cover" />
          ))}
        {video && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Play aria-hidden className="h-6 w-6 fill-white text-white drop-shadow" />
          </span>
        )}
      </button>
      <button
        onClick={() => {
          if (window.confirm(video ? "Remove this video?" : "Remove this photo?")) onRemove();
        }}
        className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-lg"
        aria-label={video ? "Remove video" : "Remove photo"}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
