import { useCallback } from "react";
import L from "leaflet";
import { ZoomIn, ZoomOut, LocateIcon } from "lucide-react";
import { MapCacheControls } from "./MapCacheControls";

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  showDownload: boolean;
}

export function MapControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  showDownload,
}: MapControlsProps) {
  // These controls sit inside the map's DOM: keep their clicks from reaching the map.
  const shield = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  return (
    <div ref={shield} className="fixed right-4 top-24 md:bottom-4 z-[1000] flex flex-col gap-2">
      <div className="flex flex-col bg-white rounded-xl shadow-lg overflow-hidden">
        <button
          onClick={onZoomIn}
          className="p-3 hover:bg-gray-100 transition-colors active:bg-gray-200"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-6 h-6 text-gray-700" />
        </button>
        <div className="w-full h-px bg-gray-200" />
        <button
          onClick={onZoomOut}
          className="p-3 hover:bg-gray-100 transition-colors active:bg-gray-200"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-6 h-6 text-gray-700" />
        </button>
        <div className="w-full h-px bg-gray-200" />
        <button
          onClick={onResetView}
          className="p-3 hover:bg-gray-100 transition-colors active:bg-gray-200"
          aria-label="Reset view"
        >
          <LocateIcon className="w-6 h-6 text-gray-700" />
        </button>
      </div>
      <div className="flex flex-col bg-white rounded-xl shadow-lg overflow-hidden">
        {showDownload && <MapCacheControls />}
      </div>
    </div>
  );
}
