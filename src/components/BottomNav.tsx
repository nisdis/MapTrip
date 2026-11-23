import { Search, Navigation, Star, Menu, Route, Circle } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMoreClick: () => void;
  onRecord: () => void;
}

export function BottomNav({ activeTab, onTabChange, onMoreClick, onRecord }: BottomNavProps) {
  const navItems = [
    { id: "search", icon: Search, label: "Search" },
    { id: "directions", icon: Navigation, label: "Directions" },
    { id: "record", icon: Circle, label: "Record", onClick: onRecord },
    { id: "trips", icon: Route, label: "Trips" },
    { id: "saved", icon: Star, label: "Saved" },
    { id: "more", icon: Menu, label: "More", onClick: onMoreClick },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          if (item.id === "record") {
            return (
              <button
                key={item.id}
                onClick={onRecord}
                className="flex flex-col items-center justify-center flex-1 h-full -mt-5 focus-visible:outline-none group"
                aria-label="Record a trip"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-milestone text-[#1F2A30] shadow-lg ring-4 ring-white dark:ring-[#1c2429] group-focus-visible:ring-asphalt">
                  <Circle className="w-6 h-6 fill-signal text-signal" />
                </span>
                <span className="text-xs mt-1 font-medium text-gray-700">Record</span>
              </button>
            );
          }

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
              <Icon
                className={`w-6 h-6 ${isActive ? "scale-110" : "scale-100"} transition-transform`}
              />
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}