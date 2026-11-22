import { Banknote, BedDouble, Coffee, Fuel, Pill, Stethoscope, Utensils } from "lucide-react";
import { NEARBY_CATEGORIES, type NearbyCategory } from "../services/placeService";

const ICONS: Record<string, typeof Coffee> = {
  restaurant: Utensils,
  cafe: Coffee,
  fuel: Fuel,
  atm: Banknote,
  hotel: BedDouble,
  hospital: Stethoscope,
  pharmacy: Pill,
};

interface CategoryChipsProps {
  activeId: string | null;
  onSelect: (category: NearbyCategory) => void;
}

/** "Restaurants · Cafes · Petrol …" shortcuts that list places in the visible map. */
export function CategoryChips({ activeId, onSelect }: CategoryChipsProps) {
  return (
    <nav
      aria-label="Find nearby"
      className="pointer-events-auto absolute left-0 right-0 top-[4.25rem] z-10 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
    >
      {NEARBY_CATEGORIES.map((c) => {
        const Icon = ICONS[c.id];
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(c)}
            className={`flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asphalt ${
              active ? "bg-asphalt text-white" : "bg-white text-gray-800"
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {c.label}
          </button>
        );
      })}
    </nav>
  );
}
