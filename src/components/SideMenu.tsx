import { useEffect, useRef } from "react";
import { useTheme, type ThemePref } from "../theme";
import { BUILD_ID, checkForUpdate, reloadNow, useUpdate } from "../swUpdate";
import {
  CircleUserRound,
  Compass,
  HardDriveDownload,
  Info,
  Moon,
  RefreshCw,
  Navigation,
  Route,
  Search,
  Star,
  Sun,
  SunMoon,
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
  /** signed-in person's id, for "My profile" */
  userId?: string | null;
  onExplore: () => void;
  onOfflineMaps: () => void;
  onPeople: () => void;
  /** follow requests waiting */
  peopleBadge?: number;
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
  userId = null,
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
        {signedIn && userId && item("profile", CircleUserRound, "My profile", () => window.location.assign(`/u/${userId}`))}
        {item("account", UserRound, signedIn ? "Account" : "Sign in", () => onOpen("account"))}
        <div className="my-2 border-t border-gray-100" />
        <Appearance />
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-3 px-5 py-3 text-[15px] text-gray-800 hover:bg-gray-50"
        >
          <Info aria-hidden className="h-5 w-5 text-gray-500" />
          Privacy policy
        </a>
        <AppUpdate />
      </nav>
    </>
  );
}

/** "Check for updates": the web app's version, and Reload when a newer one is ready. */
function AppUpdate() {
  const { status, canReload } = useUpdate();
  const note: Record<typeof status, string> = {
    idle: "",
    checking: "Checking…",
    current: "You have the latest version.",
    downloading: "Downloading the new version…",
    ready: canReload ? "A new version is ready." : "A new version is ready. It loads when your trip is finished.",
    offline: "You're offline. Try again when you're connected.",
    failed: "Couldn't check. Try again.",
  };
  return (
    <div className="mt-auto border-t border-gray-100 px-5 py-4">
      {canReload ? (
        <button
          type="button"
          onClick={reloadNow}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-highway py-2.5 text-sm font-bold text-white"
        >
          <RefreshCw aria-hidden className="h-4 w-4" /> Reload to update
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void checkForUpdate()}
          disabled={status === "checking" || status === "downloading" || status === "ready"}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-800 disabled:opacity-60"
        >
          <RefreshCw aria-hidden className={`h-4 w-4 ${status === "checking" || status === "downloading" ? "animate-spin" : ""}`} />
          Check for updates
        </button>
      )}
      <p role="status" className="mt-2 text-center text-xs text-gray-500">
        {note[status] && <span className="block">{note[status]}</span>}
        Version {BUILD_ID}
      </p>
    </div>
  );
}

const OPTIONS: { id: ThemePref; label: string; Icon: LucideIcon }[] = [
  { id: "system", label: "System", Icon: SunMoon },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

/** System (follows the phone), Light or Dark, as three icons on one row. Remembered on this device. */
function Appearance() {
  const { pref, setPref } = useTheme();
  return (
    <div className="flex items-center gap-3 px-5 py-2">
      <span className="flex-1 text-[15px] text-gray-800">Appearance</span>
      <div role="radiogroup" aria-label="Appearance" className="flex gap-1 rounded-full bg-gray-100 p-1">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={pref === id}
            aria-label={label}
            title={label}
            onClick={() => setPref(id)}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${pref === id ? "bg-white text-gray-900 shadow" : "text-gray-500"}`}
          >
            <Icon aria-hidden className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
