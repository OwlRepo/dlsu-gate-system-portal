import React, { useState } from "react";
import CustomTable from "../custom/CustomTable";
import { liveDataHeaders } from "@/lib/column-headers";
import { Button } from "../ui/button";
import { FileX, Flame } from "lucide-react";
import { ScanProps } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import Image from "next/image";
import { checkExpiry } from "@/lib/checkExpiry";

interface LiveData {
  data: ScanProps[];
  handleClear: () => void;
}

interface LiveDataRow {
  STATUS: ScanProps;
  ID: string;
  NAME: string;
  ACTIVITY: string;
  DATETIME?: string;
  userImage?: string;
  event?: string;
}

function formatLiveDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "N/A";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "N/A";
  }
}

export function LiveDataTable({ data, handleClear }: LiveData) {
  const [selectedData, setSelectedData] = useState<LiveDataRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const liveData = data.map((row) => ({
    STATUS: row,
    ID: row.user.user_id ? row.user.user_id : "N/A",
    NAME: row.user.name ? row.user.name : "N/A",
    ACTIVITY: row.eventTypeId && row.eventTypeId.includes("APB") ? "APB_VIOLATION" : (row.tnaKey ? (row.tnaKey === "1" ? "IN" : "OUT") : "N/A"),
    DATETIME: formatLiveDateTime(row.datetime),
    event: row.eventTypeId ? row.eventTypeId : "N/A",
  }));

  const handleRowClick = (row: LiveDataRow) => {
    setSelectedData(row);
    setIsDialogOpen(true);
  };

  const getImageType = (base64: string) => {
    if (base64.startsWith("iVBORw0KGgo")) {
      return "image/png";
    } else if (base64.startsWith("R0lGODlh")) {
      return "image/gif";
    } else if (base64.startsWith("9j/4AAQSkZJRgABAQAAAQABAAD/")) {
      return "image/jpeg";
    }
    return "image/png"; // Default to PNG if undetectable
  };

  // Map through scanDetails and convert userImage to base64 URL if it exists
  const updatedSelectedData = (selected: LiveDataRow) => {
    if (selected.STATUS.userImage) {
      const imageType = getImageType(selected.STATUS.userImage);
      const base64Data = `data:${imageType};base64,${selected.STATUS.userImage}`;
      return { ...selected, userImage: base64Data };
    }
    return selected;
  };

  const getLiveStatusColor = (scanDetail?: LiveDataRow): string => {

    if (!scanDetail) return "";

    const isExpired = checkExpiry(scanDetail.STATUS.expiryDate);
    const isDisabled = scanDetail.STATUS.disabled === "true";
    const isApb = scanDetail.event && scanDetail.event.includes("APB") ;

    const hasRemarks =
      scanDetail.STATUS.remarks !== "No remarks" &&
      scanDetail.STATUS.remarks !== null;

    if (isExpired || isDisabled || isApb) return "bg-red-500";
    if (!isExpired && scanDetail.STATUS.disabled === "false" && hasRemarks)
      return "bg-yellow-500";
    if (
      scanDetail.STATUS.remarks === "No remarks" ||
      scanDetail.STATUS.remarks === null
    )
      return "bg-green-500";

    return "";
  };

  console.log("Live Data", liveData);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Flame />
              <h2 className="text-lg font-medium">Live Data</h2>
            </div>

            <p className="text-base text-muted-foreground">
              Real-Time Entry and Exit Stats
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex items-center gap-2 border"
              onClick={handleClear}
            >
              <FileX />
              Clear
            </Button>
          </div>
        </div>
      </div>

      <CustomTable
        columns={liveDataHeaders}
        data={liveData}
        isLive
        onRowClick={handleRowClick}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Live Data Details</DialogTitle>
          </DialogHeader>
          {selectedData &&
            (() => {
              const processedData = updatedSelectedData(selectedData);

              const color = getLiveStatusColor(processedData);

              return (
                <div className="flex gap-4 items-center">
                  <div className={`relative p-2 rounded-lg w-40 ${color}`}>
                    <div className="relative h-36 w-36 overflow-hidden rounded-md mx-auto">
                      <Image
                        src={
                          processedData.userImage || "/default-user-icon.png"
                        }
                        alt={selectedData.STATUS.user.name || "default-user"}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="mt-2 text-center text-xs font-medium text-white">
                      {color === "bg-green-500"
                        ? "Allowed"
                        : color === "bg-yellow-500"
                        ? "Allowed with remarks"
                        : "Not Allowed"}
                    </div>
                  </div>

                  <div className="space-y-4 w-full">
                    <div className="flex flex-col gap-4">
                      <div className="space-2">
                        <p className="text-sm font-medium text-green-500">
                          ID : {selectedData.ID}
                        </p>

                        <p className="text-xl font-semibold">
                          {selectedData.NAME}
                        </p>
                        {selectedData.DATETIME && (
                          <p className="text-sm text-muted-foreground">
                            Date/Time: {selectedData.DATETIME}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm">Remarks: </p>
                        <div
                          className="p-2 rounded-md text-muted-foreground bg-gray-100"
                          style={{ minHeight: "5rem", whiteSpace: "pre-wrap" }}
                        >
                          {selectedData.STATUS?.remarks || undefined}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
