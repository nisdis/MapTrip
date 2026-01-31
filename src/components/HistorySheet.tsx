import { History } from "lucide-react";
import type { RouteHistoryItem } from "../services/routeHistoryService";

interface HistorySheetProps {
  history: RouteHistoryItem[];
  onSelectRoute: (historyItem: RouteHistoryItem) => void;
}

export function HistorySheet({ history, onSelectRoute }: HistorySheetProps) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <History className="w-12 h-12 text-gray-300 mb-4" />
        <p className="text-gray-500">No route history yet</p>
        <p className="text-sm text-gray-400">
          Your saved routes will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="font-semibold text-lg text-gray-800 mb-4">Route History</h2>
      <div className="flex-1 overflow-y-auto space-y-2">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectRoute(item)}
            className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {item.origin.name}
                </div>
                <div className="text-sm text-gray-500 truncate">
                  to {item.destination.name}
                </div>
              </div>
              <div className="text-xs text-gray-400">
                {new Date(item.timestamp).toLocaleDateString()}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}