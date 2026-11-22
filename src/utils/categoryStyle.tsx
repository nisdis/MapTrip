import { Banknote, BedDouble, Coffee, Fuel, MapPin, Pill, Stethoscope, Utensils } from "lucide-react";

/** One colour + icon per category, shared by the chips and the map pins so they read as one system. */
export const CATEGORY_STYLE: Record<string, { color: string; Icon: typeof Coffee }> = {
  restaurant: { color: "#D9480F", Icon: Utensils },
  cafe: { color: "#8B5E34", Icon: Coffee },
  fuel: { color: "#1F6FB2", Icon: Fuel },
  atm: { color: "#2B8A3E", Icon: Banknote },
  hotel: { color: "#7048E8", Icon: BedDouble },
  hospital: { color: "#D7263D", Icon: Stethoscope },
  pharmacy: { color: "#0B7A62", Icon: Pill },
};

export const DEFAULT_CATEGORY_STYLE = { color: "#1F2A30", Icon: MapPin };

export function categoryStyle(id: string | undefined) {
  return (id && CATEGORY_STYLE[id]) || DEFAULT_CATEGORY_STYLE;
}
