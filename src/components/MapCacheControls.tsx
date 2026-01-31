import { useState } from "react";
import { useMap } from "react-leaflet";
import { Download, Trash2 } from "lucide-react";
import { cacheTileRegion, clearTileCache } from "../services/tileService";

interface MapCacheControlsProps {
  onCacheComplete?: () => void;
  onClearComplete?: () => void;
}

export function MapCacheControls({
  onCacheComplete,
  onClearComplete,
}: MapCacheControlsProps) {
  const [isCaching, setIsCaching] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const map = useMap();

  const handleCacheTiles = async () => {
    if (!map || isCaching) return;
    setIsCaching(true);
    try {
      const bounds = map.getBounds();
      await cacheTileRegion(bounds);
      onCacheComplete?.();
    } catch (error) {
      console.error("Failed to cache map area:", error);
    } finally {
      setIsCaching(false);
    }
  };

  const handleClearCache = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await clearTileCache();
      onClearComplete?.();
    } catch (error) {
      console.error("Failed to clear map cache:", error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <button
        onClick={handleCacheTiles}
        disabled={isCaching}
        className={`p-3 hover:bg-gray-100 transition-colors active:bg-gray-200 ${
          isCaching ? "opacity-50 cursor-not-allowed" : ""
        }`}
        aria-label="Cache current map area"
      >
        <Download
          className={`w-6 h-6 text-blue-600 ${isCaching ? "animate-pulse" : ""}`}
        />
      </button>
      <div className="w-full h-px bg-gray-200" />
      <button
        onClick={handleClearCache}
        disabled={isClearing}
        className={`p-3 hover:bg-gray-100 transition-colors active:bg-gray-200 ${
          isClearing ? "opacity-50 cursor-not-allowed" : ""
        }`}
        aria-label="Clear map cache"
      >
        <Trash2
          className={`w-6 h-6 text-red-600 ${isClearing ? "animate-pulse" : ""}`}
        />
      </button>
    </>
  );
}
