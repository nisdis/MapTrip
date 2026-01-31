import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { SearchResults } from "./SearchResults";
import { searchPlaces, type SearchResult } from "../services/searchService";

interface SearchSheetProps {
  onSearch: (location: SearchResult) => void;
}

export function SearchSheet({ onSearch }: SearchSheetProps) {
  const debounceTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    debounceTimeoutRef.current = setTimeout(() => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }
      setIsWaiting(true);
      setIsLoading(true);
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
    console.log(value);
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
  }, [isWaiting]);

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSubmit} className="mt-2 mb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2  text-gray-400 w-5 h-5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
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
