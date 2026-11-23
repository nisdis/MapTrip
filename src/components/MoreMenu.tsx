import { useTheme, type ThemePref } from "../theme";
import {
  Trash2,
  Settings,
  Info,
  X,
  Wifi,
  WifiOff, Compass, HardDriveDownload } from "lucide-react";

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  onClearClick: () => void;
  handleShoeRouteItems: () => void;
  isClearing?: boolean;
  onExplore: () => void;
  onOfflineMaps: () => void;
}

export function MoreMenu({
  isOpen,
  onClose,
  isOnline,
  onClearClick,
  isClearing = false,
  handleShoeRouteItems = () => {},
  onExplore,
  onOfflineMaps,
}: MoreMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-4 bottom-20 z-50">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-64">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">More Options</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="py-2">
            <div className="px-4 py-2 flex items-center gap-3">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-green-600" />
              ) : (
                <WifiOff className="w-5 h-5 text-amber-600" />
              )}
              <span className="text-sm text-gray-700">
                {isOnline ? "Online" : "Offline Mode"}
              </span>
            </div>
            <div className="border-t border-gray-100 my-2" />
            <Appearance />
            <div className="border-t border-gray-100 my-2" />
            <button
              onClick={onExplore}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            >
              <Compass className="w-5 h-5 text-emerald-700" />
              <span className="text-sm text-gray-700">Explore trips</span>
            </button>
            <button
              onClick={onOfflineMaps}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            >
              <HardDriveDownload className="w-5 h-5 text-emerald-700" />
              <span className="text-sm text-gray-700">Offline maps</span>
            </button>
            <button
              onClick={onClearClick}
              disabled={isClearing}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Trash2
                className={`w-5 h-5 text-red-600 ${isClearing ? "animate-pulse" : ""}`}
              />
              <span className="text-sm text-gray-700">
                {isClearing ? "Clearing..." : "Clear Map Cache"}
              </span>
            </button>
            <div className="border-t border-gray-100 my-2" />
            <button
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              onClick={handleShoeRouteItems}
            >
              <Settings className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-700">Show detailed</span>
            </button>
            <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
              <Info className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-700">About</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** System (follows the phone), Light or Dark. Remembered on this device. */
function Appearance() {
  const { pref, setPref } = useTheme();
  return (
    <div className="px-4 py-2">
      <div className="mb-1.5 text-xs font-medium text-gray-500">Appearance</div>
      <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={pref === o.id}
            onClick={() => setPref(o.id)}
            className={`rounded-md py-1.5 text-xs font-medium ${pref === o.id ? "bg-white text-gray-900 shadow" : "text-gray-600"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
