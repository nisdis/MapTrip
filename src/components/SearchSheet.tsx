import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { SearchResults } from "./SearchResults";
import { searchPlaces, type SearchResult } from "../services/searchService";

interface SearchSheetProps {
  onSearch: (location: SearchResult) => void;
}

const DEBOUNCE_MS = 500;

export function SearchSheet({ onSearch }: SearchSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // Query that should be searched right now (set by debounce or submit).
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce typing into activeQuery.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setActiveQuery("");
      return;
    }
    const timer = setTimeout(() => setActiveQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Run the search; ignore stale responses.
  useEffect(() => {
    if (!activeQuery) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    searchPlaces(activeQuery)
      .then((r) => {
        if (!cancelled) setResults(r);
      })
      .catch((error) => {
        console.error("Search failed:", error);
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) setActiveQuery(trimmed);
  };

  const handleSelectResult = (result: SearchResult) => {
    onSearch(result);
    setQuery(result.name);
    setActiveQuery("");
    setResults([]);
  };

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSubmit} className="mt-2 mb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2  text-gray-400 w-5 h-5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search location..."
            className="w-full px-4 py-3 pl-12 pr-12 bg-gray-100 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
          {isLoading && (
            <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
          )}
        </div>
      </form>
      <SearchResults
        results={results}
        onSelectResult={handleSelectResult}
        isLoading={isLoading}
      />
    </div>
  );
}
