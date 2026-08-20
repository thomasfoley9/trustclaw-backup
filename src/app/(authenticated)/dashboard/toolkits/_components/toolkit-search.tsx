"use client";

import { Search } from "lucide-react";
import { SearchInput } from "~/components/core/search-input";
import { Spinner } from "~/components/ui/spinner";

interface ToolkitSearchProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function ToolkitSearch({ onSearch, isLoading }: ToolkitSearchProps) {
  return (
    <div className="relative w-full sm:w-72">
      {isLoading ? (
        <Spinner className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      ) : (
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <SearchInput
        placeholder="Search across 500+ toolkits..."
        aria-label="Search toolkits"
        className="pl-9"
        debounceMs={300}
        onSearch={onSearch}
      />
    </div>
  );
}
