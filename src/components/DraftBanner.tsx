import type { TripDraft } from "../services/draftStore";
import { formatClock, formatKm } from "../utils/tripStats";

interface DraftBannerProps {
  draft: TripDraft;
  onReview: () => void;
  onDiscard: () => void;
}

export function DraftBanner({ draft, onReview, onDiscard }: DraftBannerProps) {
  return (
    <div
      role="alert"
      className="absolute top-20 left-4 right-4 md:left-auto md:w-96 z-20 rounded-2xl bg-paper text-asphalt font-hud shadow-lg p-4"
    >
      <p className="font-bold">You have an unfinished trip</p>
      <p className="mt-1 text-sm text-asphalt/70">
        {formatKm(draft.distanceM)} km over {formatClock(draft.activeSeconds)}, recorded{" "}
        {new Date(draft.startedAt).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Discard the unfinished trip?")) onDiscard();
          }}
          className="h-11 px-4 rounded-xl border-2 border-asphalt/30 font-bold"
        >
          Discard
        </button>
        <button type="button" onClick={onReview} className="h-11 flex-1 rounded-xl bg-milestone font-bold">
          Review and save
        </button>
      </div>
    </div>
  );
}
