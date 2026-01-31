import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { SearchResults } from "./SearchResults";
import { searchPlaces, type SearchResult } from "../services/searchService";

interface SearchBarProps {
  onSearch: (location: SearchResult) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const debounceTimeoutRef = useRef<number | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

  const searchIt = async () => {
    try {
      setIsLoading(true);
      const searchResults = await searchPlaces(query);
      setResults(searchResults);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  };
  const searchLocation = (searchQuery: string) => {
    if (debounceTimeoutRef.current) {
      setIsWaiting(false);
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsWaiting(true);
      setIsLoading(true);
      console.log("Debounced query:", searchQuery);
    }, 1300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchLocation(query);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    searchLocation(value);
  };

  const handleSelectResult = (result: SearchResult) => {
    onSearch(result);
    setQuery(result.name);
    setResults([]);
  };
  useEffect(() => {
    if (isWaiting) {
      console.log("first");
      searchIt();
    }
    return () => {
      console.log("fisecondrst");
      searchIt();
    };
  }, [isWaiting]);

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-sm relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search location..."
          className="w-full px-4 py-2 pl-10 pr-12 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <button
          type="submit"
          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
      <SearchResults
        results={results}
        onSelectResult={handleSelectResult}
        isLoading={isLoading}
      />
    </form>
  );
}
