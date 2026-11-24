interface RecordButtonProps {
  onRecord: () => void;
}

/** The one button at the bottom of the map: start recording a trip. Everything else is in the ☰ menu. */
export function RecordButton({ onRecord }: RecordButtonProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] z-40 flex justify-center">
      <button
        type="button"
        onClick={onRecord}
        aria-label="Record a trip"
        className="pointer-events-auto flex flex-col items-center gap-1 rounded-full focus-visible:outline-none group"
      >
        <span className="h-16 w-16 rounded-full bg-signal shadow-lg ring-4 ring-white dark:ring-[#1c2429] group-focus-visible:ring-asphalt" />
        <span className="rounded-full bg-white/90 px-2 text-xs font-semibold text-gray-800 shadow-sm">Record</span>
      </button>
    </div>
  );
}
