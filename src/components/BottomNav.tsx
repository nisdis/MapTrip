import { Search, Navigation, Star, MoreVertical, Route, Circle, type LucideIcon } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMoreClick: () => void;
  onRecord: () => void;
  /** a dot on More (follow requests waiting) */
  moreBadge?: boolean;
}

interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}

export function BottomNav({ activeTab, onTabChange, onMoreClick, onRecord, moreBadge = false }: BottomNavProps) {
  // Record sits in the exact middle: the two sides share the remaining width equally,
  // whatever number of items each side has.
  const left: NavItem[] = [
    { id: "search", icon: Search, label: "Search" },
    { id: "directions", icon: Navigation, label: "Directions" },
  ];
  const right: NavItem[] = [
    { id: "trips", icon: Route, label: "Trips" },
    { id: "saved", icon: Star, label: "Saved" },
    { id: "more", icon: MoreVertical, label: "More", onClick: onMoreClick },
  ];

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => (item.onClick ? item.onClick() : onTabChange(item.id))}
        className={`flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200 ${
          isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
        }`}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="relative">
          <Icon className={`w-6 h-6 ${isActive ? "scale-110" : "scale-100"} transition-transform`} />
          {item.id === "more" && moreBadge && (
            <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-white" />
          )}
        </span>
        <span className="text-xs mt-1 font-medium">{item.label}</span>
      </button>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-inset-bottom">
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex h-full">{left.map(renderItem)}</div>
        <button
          onClick={onRecord}
          className="relative flex w-20 flex-col items-center justify-center h-full focus-visible:outline-none group"
          aria-label="Record a trip"
        >
          {/* The circle rises above the bar; the label lines up with the other labels. */}
          <span className="h-6 w-6" aria-hidden />
          <span className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-[38%] items-center justify-center rounded-full bg-milestone text-[#1F2A30] shadow-lg ring-4 ring-white dark:ring-[#1c2429] group-focus-visible:ring-asphalt">
            <Circle className="w-6 h-6 fill-signal text-signal" />
          </span>
          <span className="text-xs mt-1 font-medium text-gray-700">Record</span>
        </button>
        <div className="flex h-full">{right.map(renderItem)}</div>
      </div>
    </div>
  );
}
