import { useCallback, useEffect, useRef, useState } from "react";
import { Download, HardDriveDownload, Loader2, Trash2 } from "lucide-react";
import type { Bounds } from "../services/placeService";
import { nominatimGet } from "../services/nominatimClient";
import {
  MAX_AREA_KM,
  deleteArea,
  estimateArea,
  formatMB,
  listAreas,
  saveArea,
  type SavedArea,
} from "../services/offlineMaps";

interface OfflineMapsSheetProps {
  /** what's on screen now */
  bounds: Bounds | null;
  isOnline: boolean;
  onShowArea: (b: Bounds) => void;
}

/** "Save this area" and the list of saved areas (More › Offline maps). */
export function OfflineMapsSheet({ bounds, isOnline, onShowArea }: OfflineMapsSheetProps) {
  const [areas, setAreas] = useState<SavedArea[] | null>(null);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const est = bounds ? estimateArea(bounds) : null;

  const refresh = useCallback(() => void listAreas().then(setAreas).catch(() => setAreas([])), []);
  useEffect(() => {
    refresh();
    return () => abort.current?.abort();
  }, [refresh]);

  // Suggest a name: the town or city in the middle of the screen.
  useEffect(() => {
    if (!bounds || !isOnline) return;
    const ctrl = new AbortController();
    const lat = (bounds.north + bounds.south) / 2;
    const lng = (bounds.east + bounds.west) / 2;
    nominatimGet<{ address?: Record<string, string> }>(`/reverse?format=jsonv2&zoom=10&lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`, ctrl.signal)
      .then((r) => {
        const a = r.address ?? {};
        const place = a.city ?? a.town ?? a.village ?? a.county ?? a.state;
        if (place) setName((n) => n || place);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
    // Only once, for the area shown when the sheet opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!bounds) return;
    setError(null);
    setNotice(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ done: 0, total: est?.tiles ?? 0 });
    try {
      const area = await saveArea(name, bounds, (done, total) => setProgress({ done, total }), ctrl.signal);
      setNotice(`Saved “${area.name}” (${formatMB(area.bytes)}). It works without a connection.`);
      setName("");
      refresh();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Couldn't save the area");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <HardDriveDownload className="h-5 w-5 text-highway" />
        <h2 className="text-lg font-semibold text-gray-800">Offline maps</h2>
      </div>

      <div className="rounded-xl bg-gray-50 p-3">
        <p className="text-sm font-medium text-gray-900">Save the area on screen</p>
        {est && (
          <p className="mt-0.5 text-xs text-gray-500">
            {est.widthKm.toFixed(1)} × {est.heightKm.toFixed(1)} km · about {formatMB(est.bytes)}
          </p>
        )}
        {est?.tooBig ? (
          <p className="mt-2 text-sm text-[#9a6700]">Zoom in: one area can be at most {MAX_AREA_KM} km across.</p>
        ) : !isOnline ? (
          <p className="mt-2 text-sm text-[#9a6700]">Connect to the internet to save an area.</p>
        ) : progress ? (
          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="h-full bg-highway transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Downloading {progress.done} of {progress.total}
              </span>
              <button type="button" onClick={() => abort.current?.abort()} className="font-medium text-red-600">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Name, e.g. Kyoto"
              aria-label="Area name"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-base"
            />
            <button
              type="button"
              disabled={!bounds}
              onClick={start}
              className="flex items-center gap-1.5 rounded-lg bg-highway px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Save
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-2 text-sm text-green-700">
            {notice}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Saved areas</p>
        {areas && areas.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">None yet. Maps you've looked at recently also work offline for about a week.</p>
        )}
        <ul className="mt-2 space-y-2 pb-20">
          {(areas ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl bg-gray-50 p-3">
              <button type="button" onClick={() => onShowArea(a.bounds)} className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium text-gray-900">{a.name}</div>
                <div className="text-xs text-gray-500">
                  {formatMB(a.bytes)} · saved {new Date(a.savedAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                </div>
              </button>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={async () => {
                  if (!window.confirm(`Remove “${a.name}” from this phone?`)) return;
                  await deleteArea(a.id);
                  refresh();
                }}
                className="p-2 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
