import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Images, Settings, Video } from "lucide-react";
import { askCamera, openAppSettings, type CameraAccess } from "../services/appBridge";

interface MediaPickerProps {
  onFiles: (files: File[]) => void;
  /** the button that opens the menu */
  children: ReactNode;
  buttonClassName: string;
  buttonLabel: string;
  /** where the menu opens: above the button (recorder) or below it (lists) */
  placement?: "above" | "below";
}

/**
 * Photo/video: Take photo, Record video, or Choose from gallery. Each choice
 * opens exactly one thing (Android's combined picker often hides the camera).
 * Opening the menu asks for the camera the first time (in the app).
 */
export function MediaPicker({ onFiles, children, buttonClassName, buttonLabel, placement = "above" }: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [camera, setCamera] = useState<CameraAccess | "asking">("asking");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setCamera("asking");
    void askCamera().then((a) => live && setCamera(a));
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      live = false;
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setOpen(false);
    if (files.length) onFiles(files);
  };

  const item = "flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-asphalt hover:bg-asphalt/5";
  const cameraOk = camera === "granted";

  return (
    <div ref={box} className="contents">
      <button
        type="button"
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add photo or video"
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {children}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Add photo or video"
          className={`absolute right-4 z-40 w-60 overflow-hidden rounded-xl border border-asphalt/15 bg-paper font-hud shadow-[0_10px_30px_rgba(31,42,48,0.25)] ${
            placement === "above" ? "bottom-full mb-2" : "top-full mt-1"
          }`}
        >
          {cameraOk && (
            <>
              <label role="menuitem" className={`${item} cursor-pointer`}>
                <Camera aria-hidden className="h-5 w-5" /> Take photo
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={take} />
              </label>
              <label role="menuitem" className={`${item} cursor-pointer`}>
                <Video aria-hidden className="h-5 w-5" /> Record video
                <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={take} />
              </label>
            </>
          )}
          {camera === "asking" && <p className="px-4 py-3 text-sm text-asphalt/60">Checking camera…</p>}
          {(camera === "denied" || camera === "blocked") && (
            <div className="px-4 py-3 text-sm">
              <p className="text-asphalt/75">Camera access is off, so photos and videos can only come from the gallery.</p>
              {camera === "blocked" ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void openAppSettings()}
                  className="mt-2 flex items-center gap-2 font-bold text-highway underline"
                >
                  <Settings aria-hidden className="h-4 w-4" /> Turn on camera in Settings
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCamera("asking");
                    void askCamera().then(setCamera);
                  }}
                  className="mt-2 font-bold text-highway underline"
                >
                  Allow camera
                </button>
              )}
            </div>
          )}
          <label role="menuitem" className={`${item} cursor-pointer border-t border-asphalt/10`}>
            <Images aria-hidden className="h-5 w-5" /> Choose from gallery
            <input type="file" accept="image/*,video/*" multiple className="sr-only" onChange={take} />
          </label>
        </div>
      )}
    </div>
  );
}
