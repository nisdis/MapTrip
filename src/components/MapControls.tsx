import React from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export function MapControls({ onZoomIn, onZoomOut, onResetView }: MapControlsProps) {
  return (
    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-100">
      <div className="flex flex-col gap-2 bg-white rounded-lg shadow-lg p-2">
        <button
          onClick={onZoomIn}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-5 h-5 text-gray-700" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-5 h-5 text-gray-700" />
        </button>
        <button
          onClick={onResetView}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          aria-label="Reset view"
        >
          <Maximize2 className="w-5 h-5 text-gray-700" />
        </button>
      </div>
    </div>
  );
}