import { useEffect, useRef } from "react";
import { useTheme, type ThemePref } from "../theme";
import {
  Compass,
  HardDriveDownload,
  Info,
  Navigation,
  Route,
  Search,
  Settings,
  Star,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  /** open one of the app's panels: search, directions, trips, saved, account */
  onOpen: (panel: string) => void;
  activePanel: string | null;
  signedIn: boolean;
  onExplore: () => void;
  onOfflineMaps: () => void;
  onPeople: () => void;
  /** follow requests waiting */
  peopleBadge?: number;
  onClearClick: () => void;
  isClearing?: boolean;
  handleShoeRouteItems: () => void;
}

/** The app's menu: a drawer from the left, opened from the ☰ button. */
export function SideMenu({
  isOpen,
  onClose,
  onOpen,
  activePanel,
  signedIn,
  onExplore,
  onOfflineMaps,
  onPeople,
  peopleBadge = 0,
  onClearClick,
  isClearing = false,
  handleShoeRouteItems,
}: SideMenuProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const item = (id: string, Icon: LucideIcon, label: string, onClick: () => void, extra?: React.ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      aria-current={activePanel === id ? "page" : undefined}
      className={`flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] transition-colors hover:bg-gray-50 ${
        activePanel === id ? "font-semibold text-highway" : "text-gray-800"
      }`}
    >
      <Icon aria-hidden className={`h-5 w-5 ${activePanel === id ? "text-highway" : "text-gray-500"}`} />
      <span className="flex-1">{label}</span>
      {extra}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} aria-hidden />
      <nav
        aria-label="Menu"
        className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-lg font-bold text-gray-800">Map Trip</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close menu" className="rounded-full p-1.5 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {item("search", Search, "Search", () => onOpen("search"))}
        {item("directions", Navigation, "Directions", () => onOpen("directions"))}
        {item("trips", Route, "Trips", () => onOpen("trips"))}
        {item("saved", Star, "Saved", () => onOpen("saved"))}
        <div className="my-2 border-t border-gray-100" />
        {item("explore", Compass, "Explore trips", onExplore)}
        {item(
          "people",
          Users,
          "People",
          onPeople,
          peopleBadge > 0 && (
            <span className="rounded-full bg-signal px-2 py-0.5 text-xs font-bold text-white" aria-label={`${peopleBadge} follow requests`}>
              {peopleBadge}
            </span>
          ),
        )}
        {item("offline", HardDriveDownload, "Offline maps", onOfflineMaps)}
        {item("account", UserRound, signedIn ? "Account" : "Sign in", () => onOpen("account"))}
        <div className="my-2 border-t border-gray-100" />
        <Appearance />
        {item("detailed", Settings, "Show detailed route", handleShoeRouteItems)}
        <button
          type="button"
          onClick={onClearClick}
          disabled={isClearing}
          className="flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          <Trash2 aria-hidden className={`h-5 w-5 text-red-600 ${isClearing ? "animate-pulse" : ""}`} />
          {isClearing ? "Clearing…" : "Clear map cache"}
        </button>
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-3 px-5 py-3 text-[15px] text-gray-800 hover:bg-gray-50"
        >
          <Info aria-hidden className="h-5 w-5 text-gray-500" />
          Privacy policy
        </a>
      </nav>
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
    <div className="px-5 py-2">
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
