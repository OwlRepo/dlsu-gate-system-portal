"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, LoaderCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface ExportSettings {
  includePhoto?: boolean;
  dateFrom: string;
  dateTo: string;
  types?: string[] | null;
}

interface CustomExportProps {
  onExport: (settings: ExportSettings) => void;
  loading?: boolean;
  typeOptions?: string[];
  showIncludePhoto?: boolean;
}

export default function CustomExport({
  onExport,
  loading,
  typeOptions = [],
  showIncludePhoto = false,
}: CustomExportProps) {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() => {
    // Initialize export settings based on showIncludePhoto prop
    const baseSettings = {
      dateFrom: "",
      dateTo: "",
      types: null,
    };
    
    // Only include includePhoto if showIncludePhoto is true
    return showIncludePhoto 
      ? { ...baseSettings, includePhoto: false } 
      : baseSettings as ExportSettings;
  });

    // Create a single ref for the entire export component
    const exportComponentRef = useRef<HTMLDivElement>(null);

  // Toggle export container
  const toggleExportContainer = () => {
    setIsExportOpen(!isExportOpen);
  };

  // Update export settings
  const updateExportSettings = (
    field: keyof ExportSettings,
    value: boolean | string | string[]
  ) => {
    setExportSettings((prevSettings) => ({
      ...prevSettings,
      [field]: value,
    }));
  };

  // Clear all export settings
  const clearExportSettings = () => {
    const baseSettings = {
      dateFrom: "",
      dateTo: "",
      types: null,
    };
    
    // Only include includePhoto if showIncludePhoto is true
    setExportSettings(showIncludePhoto 
      ? { ...baseSettings, includePhoto: false } 
      : baseSettings as ExportSettings);
  };

  // Initiate export
  const initiateExport = () => {
    onExport(exportSettings);
    setIsExportOpen(false); // Close the export settings after initiating export
    
    const baseSettings = {
      dateFrom: "",
      dateTo: "",
      types: null,
    };
    
    // Only include includePhoto if showIncludePhoto is true
    setExportSettings(showIncludePhoto 
      ? { ...baseSettings, includePhoto: false } 
      : baseSettings as ExportSettings);
  };

  // Check if any export setting is applied
  const isSettingApplied = 
  (showIncludePhoto && exportSettings.includePhoto) ||
  exportSettings.dateFrom ||
  exportSettings.dateTo ||
  (exportSettings.types && exportSettings.types.length > 0);

  // Handle clicks outside
  useEffect(() => {
    // Only add the listener when the export container is open
    if (!isExportOpen) return;

    function handleClick(event: MouseEvent) {
      // Check if click is outside our component
      if (
        exportComponentRef.current &&
        !exportComponentRef.current.contains(event.target as Node) &&
        // Special handling for Radix UI dropdowns
        !(event.target as Element).closest(
          "[data-radix-popper-content-wrapper]"
        )
      ) {
        setIsExportOpen(false);
      }
    }

    // Use mousedown to capture the event before other handlers
    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isExportOpen]);

  console.log("Export Settings", exportSettings);

  return (
    <div className="w-full max-w-4xl mx-auto" ref={exportComponentRef}>
      <Button
        onClick={toggleExportContainer}
        className="flex items-center gap-2"
      >
        {loading ? (
          <span className="animate-spin mr-2">
            <LoaderCircle className="h-4 w-4" />
          </span>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Export
            {isSettingApplied && (
              <Badge variant="secondary" className="ml-1">
                {Object.values(exportSettings).filter(Boolean).length}
              </Badge>
            )}
          </>
        )}
      </Button>

      {isExportOpen && (
        <Card
          className="absolute right-12 mt-2 p-4 max-h-[80vh] overflow-y-auto z-50 shadow-lg w-[300px]"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Export Settings</h3>
              {isSettingApplied && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearExportSettings}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Include Photo Option */}
            {showIncludePhoto && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-photo"
                  checked={exportSettings.includePhoto}
                  onCheckedChange={(checked) =>
                    updateExportSettings("includePhoto", checked as boolean)
                  }
                />
                <Label htmlFor="include-photo">Include Photo</Label>
              </div>
            )}

            {/* Type Selection */}
            {typeOptions.length !== 0 && (
              <div className="space-y-2">
                <Label htmlFor="type-select">Type</Label>
                <Select
                  value={exportSettings.types?.[0] || ""}
                  onValueChange={(value) => {
                    updateExportSettings("types", [value]);
                  }}
                >
                  <SelectTrigger id="type-select" className="w-full">
                    <SelectValue placeholder="Select user type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === "super-admin"
                          ? "Super Admin"
                          : type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date Range Picker */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <p className="text-red-600 text-sm">
                Date range cannot exceed 6 months
              </p>
              <div className="flex flex-col gap-2">
                <div>
                  <Label
                    htmlFor="date-from"
                    className="text-xs text-muted-foreground"
                  >
                    From
                  </Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={exportSettings.dateFrom}
                    onChange={(e) =>
                      updateExportSettings("dateFrom", e.target.value)
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="date-to"
                    className="text-xs text-muted-foreground"
                  >
                    To
                  </Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={exportSettings.dateTo}
                    onChange={(e) =>
                      updateExportSettings("dateTo", e.target.value)
                    }
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Export Button */}
            <Button onClick={initiateExport} className="w-full">
              Export
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
