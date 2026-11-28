import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { TRIP_NAME_MAX } from "../../api/_lib/tripName";

interface TripNameEditorProps {
  name: string;
  onSave: (name: string) => Promise<void>;
  onDone: () => void;
  className?: string;
}

/** Inline rename: Enter or ✓ saves, Esc or ✕ cancels. */
export function TripNameEditor({ name, onSave, onDone, className = "" }: TripNameEditorProps) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename it");
      setBusy(false);
    }
  };

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center gap-1">
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onDone();
            }
          }}
          maxLength={TRIP_NAME_MAX}
          aria-label="Trip name"
          className="min-w-0 flex-1 rounded-lg border border-asphalt/25 bg-white px-2.5 py-1.5 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-asphalt"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label="Save name"
          className="rounded-full p-2 text-green-700 hover:bg-green-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        </button>
        <button type="button" onClick={onDone} aria-label="Cancel rename" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
          <X className="h-5 w-5" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
