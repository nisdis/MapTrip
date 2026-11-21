import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getPhotoBlob } from "../services/photoStore";

interface PhotoThumbProps {
  photoId: string;
  onRemove: () => void;
}

export function PhotoThumb({ photoId, onRemove }: PhotoThumbProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    getPhotoBlob(photoId).then((blob) => {
      if (blob && !cancelled) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  return (
    <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="Trip photo" className="w-full h-full object-cover" />
        </a>
      )}
      <button
        onClick={() => {
          if (window.confirm("Remove this photo?")) onRemove();
        }}
        className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-lg"
        aria-label="Remove photo"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
