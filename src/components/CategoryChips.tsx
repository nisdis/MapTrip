import { NEARBY_CATEGORIES, type NearbyCategory } from "../services/placeService";
import { categoryStyle } from "../utils/categoryStyle";

interface CategoryChipsProps {
  activeId: string | null;
  onSelect: (category: NearbyCategory) => void;
}

/**
 * Icon-only shortcuts that list places in the visible map. Each chip uses the same
 * colour as its map pins; the selected one also shows its name.
 */
export function CategoryChips({ activeId, onSelect }: CategoryChipsProps) {
  return (
    <nav
      aria-label="Find nearby"
      className="pointer-events-auto absolute left-0 right-0 top-[4.25rem] z-10 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
    >
      {NEARBY_CATEGORIES.map((c) => {
        const { color, Icon } = categoryStyle(c.id);
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            aria-label={c.label}
            title={c.label}
            onClick={() => onSelect(c)}
            style={active ? { background: color } : { color }}
            className={`flex h-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-full shadow-md transition-[padding] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt ${
              active ? "px-3.5 text-white" : "w-10 bg-white"
            }`}
          >
            <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.25} />
            {active && <span className="text-sm font-bold">{c.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
