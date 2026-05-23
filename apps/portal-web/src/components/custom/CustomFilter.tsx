"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Filter, Plus, X } from "lucide-react";

type Type = string;
type FilterType = "type" | "dateRange";

export interface FilterItem {
  id: string;
  type: FilterType;
  value: {
    type?: Type;
    dateFrom?: string;
    dateTo?: string;
  };
}

interface CustomFilterProps {
  onFiltersChange?: (filters: FilterItem[]) => void;
  typeOptions?: string[];
}

export default function CustomFilter({
  onFiltersChange,
  typeOptions = [""],
}: CustomFilterProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterItem[]>([]);
  const [selectedFilterType, setSelectedFilterType] =
    useState<FilterType | null>(null);

  // // Add refs for the filter container and button
  // const filterContainerRef = useRef<HTMLDivElement>(null);
  // const filterButtonRef = useRef<HTMLButtonElement>(null);

  // Create a single ref that covers both the button and the filter content
  const filterComponentRef = useRef<HTMLDivElement>(null);

  // Toggle filter container
  const toggleFilterContainer = () => {
    setIsFilterOpen(!isFilterOpen);
  };

  // generate uuid
  const generateUUID = (): string => {
    // Use crypto.randomUUID() if available
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    // Fallback implementation for environments without crypto.randomUUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  };

  //  add Filter function
  const addFilter = (type: FilterType) => {
    const newFilters = [...filters, { id: generateUUID(), type, value: {} }];
    setFilters(newFilters);
    setSelectedFilterType(null);
    onFiltersChange?.(newFilters);
  };

  // Update a specific filter
  const updateFilter = (id: string, value: Partial<FilterItem["value"]>) => {
    const updatedFilters = filters.map((filter) =>
      filter.id === id
        ? { ...filter, value: { ...filter.value, ...value } }
        : filter
    );
    setFilters(updatedFilters);
    onFiltersChange?.(updatedFilters);
  };

  // Remove a specific filter
  const removeFilter = (id: string) => {
    const updatedFilters = filters.filter((filter) => filter.id !== id);
    setFilters(updatedFilters);
    onFiltersChange?.(updatedFilters);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters([]);
    onFiltersChange?.([]);
  };

  // Check if any filter is applied
  const isFilterApplied = filters.length > 0;

  // Check if a filter type is already in use
  const isFilterTypeInUse = (type: FilterType) => {
    return filters.some((filter) => filter.type === type);
  };

  // Handle clicks outside
  // Simplified click outside handler
  useEffect(() => {
    // Only add the listener when the filter is open
    if (!isFilterOpen) return;

    function handleClick(event: MouseEvent) {
      // Check if click is outside our component
      if (
        filterComponentRef.current &&
        !filterComponentRef.current.contains(event.target as Node) &&
        // Special handling for Radix UI dropdowns
        !(event.target as Element).closest(
          "[data-radix-popper-content-wrapper]"
        )
      ) {
        setIsFilterOpen(false);
      }
    }

    // Use mousedown to capture the event before other handlers
    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isFilterOpen]);

  return (
    <div className="w-full max-w-4xl mx-auto" ref={filterComponentRef}>
      <Button
        variant="outline"
        onClick={toggleFilterContainer}
        className="flex items-center gap-2 text-green-500 border-green-500 hover:text-green-500 hover:bg-white"
      >
        <Filter className="h-4 w-4" />
        Filters
        {isFilterApplied && (
          <Badge variant="default" className="ml-1">
            {filters.length}
          </Badge>
        )}
      </Button>

      {isFilterOpen && (
        <Card className="absolute right-12 mt-2 p-4 max-h-[80vh] overflow-y-auto z-50 shadow-lg">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-medium">Filters</h3>
              <div className="flex items-center gap-2">
                {filters.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </Button>
                )}
                <Select
                  value={selectedFilterType || ""}
                  onValueChange={(value) =>
                    setSelectedFilterType(value as FilterType)
                  }
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Select filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="type"
                      disabled={isFilterTypeInUse("type")}
                    >
                      Type{isFilterTypeInUse("type") && " (Added)"}
                    </SelectItem>
                    <SelectItem
                      value="dateRange"
                      disabled={isFilterTypeInUse("dateRange")}
                    >
                      Date Range{isFilterTypeInUse("dateRange") && " (Added)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() =>
                    selectedFilterType && addFilter(selectedFilterType)
                  }
                  disabled={!selectedFilterType}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Active filters */}
            <div className="space-y-4">
              {filters.map((filter) => (
                <div
                  key={filter.id}
                  className="flex flex-col gap-2 pb-2 border-b"
                >
                  {filter.type === "type" && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor={`type-filter-${filter.id}`}>Type</Label>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFilter(filter.id)}
                          className="h-8 w-8"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Select
                        value={filter.value.type || ""}
                        onValueChange={(value) =>
                          updateFilter(filter.id, { type: value })
                        }
                      >
                        <SelectTrigger
                          id={`type-filter-${filter.id}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select user type" />
                        </SelectTrigger>
                        <SelectContent>
                          {typeOptions.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type === "1"
                                ? "IN"
                                : type === "2"
                                ? "OUT"
                                : type.charAt(0).toUpperCase() + type.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {filter.type === "dateRange" && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Date Range</Label>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFilter(filter.id)}
                          className="h-8 w-8"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div>
                          <Label
                            htmlFor={`date-from-${filter.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            From
                          </Label>
                          <Input
                            id={`date-from-${filter.id}`}
                            type="date"
                            value={filter.value.dateFrom || ""}
                            onChange={(e) =>
                              updateFilter(filter.id, {
                                dateFrom: e.target.value,
                              })
                            }
                            className="w-full"
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor={`date-to-${filter.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            To
                          </Label>
                          <Input
                            id={`date-to-${filter.id}`}
                            type="date"
                            value={filter.value.dateTo || ""}
                            onChange={(e) =>
                              updateFilter(filter.id, {
                                dateTo: e.target.value,
                              })
                            }
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
