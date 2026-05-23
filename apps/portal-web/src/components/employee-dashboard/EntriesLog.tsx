"use client";
import { ScrollArea } from "@/components/ui/scroll-area";
import Image from "next/image";
import { ScanDetailStatus, ScanProps } from "@/lib/types";
import { useGetEmployeeDetails } from "@/hooks/useGetEmployeeDetails";
import useUserToken from "@/hooks/useUserToken";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useState } from "react";

interface LogEntry {
  queue: ScanProps[];
}

function formatEntryDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "N/A";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }).format(date);
  } catch {
    return "N/A";
  }
}

export default function EntriesLog({ queue }: LogEntry) {
  const { username, token } = useUserToken();
  const { data } = useGetEmployeeDetails({
    username: username || "",
    token: token || "",
  });
  const [selectedEntry, setSelectedEntry] = useState<ScanProps | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  //// Extract unique device IDs directly from the queue
  // const uniqueDeviceIds = Array.from(
  //   new Set(queue.map(entry => entry.device.id))
  // );

  // Filter by assigned devices if needed
  const assignedDeviceIds = data?.device_id?.filter((id) => id) || [];

  // Only show entries for assigned devices if there are any assigned
  const filteredQueue =
    assignedDeviceIds.length > 0
      ? queue.filter((entry) => assignedDeviceIds.includes(entry.device.id))
      : queue;

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

  // const updatedScanQueue = queue.map((queue) => {
  //   if (queue.userImage) {
  //     const imageType = getImageType(queue.userImage);
  //     const base64Data = `data:${imageType};base64,${queue.userImage}`;
  //     return { ...queue, userImage: base64Data };
  //   }

  const updatedScanQueue = filteredQueue.map((entry) => {
    if (entry.userImage) {
      const imageType = getImageType(entry.userImage);
      const base64Data = `data:${imageType};base64,${entry.userImage}`;
      return { ...entry, userImage: base64Data };
    }
    return entry;
  });

  const checkExpiry = (expiryDate: string | undefined) => {
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      const today = new Date();
      return today > expiry;
    }
    return false;
  };

  const getBorderColorClass = (scanDetail?: ScanDetailStatus): string => {
    if (!scanDetail) return "border-2";

    const isExpired = checkExpiry(scanDetail.expiryDate);
    const isDisabled = scanDetail.disabled === "true";
    const hasRemarks =
      scanDetail.remarks !== "No remarks" && scanDetail.remarks !== null;

    // Hardcoded border classes
    if (isExpired || isDisabled) return "border-8 border-red-500";
    if (!isExpired && scanDetail.disabled === "false" && hasRemarks)
      return "border-8 border-yellow-500";
    if (scanDetail.remarks === "No remarks" || scanDetail.remarks === null)
      return "border-8 border-green-500";

    return "border-2";
  };

  const handleEntryClick = (entry: ScanProps) => {
    setSelectedEntry(entry);
    setDialogOpen(true);
  };

  return (
    <div className="flex-grow">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Recent Entries
      </h2>
      <div className="w-full max-w-2xl mx-auto">
        <ScrollArea className="h-[calc(100vh-200px)] max-w-lg pr-4">
          {updatedScanQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
              <p className="text-lg font-medium">No entries yet</p>
              <p className="text-sm">Recent entries will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...updatedScanQueue].reverse().map((entry, index) => (
                <div
                  key={index}
                  className={`bg-white rounded-lg p-4 ${getBorderColorClass(
                    entry,
                  )} 
                  cursor-pointer transition-all hover:shadow-md`}
                  onClick={() => handleEntryClick(entry)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <Image
                      src={entry.userImage || "/default-user-icon.png"}
                      alt={entry.user.name}
                      width={40}
                      height={40}
                      className="rounded-full object-cover shrink-0"
                    />
                    <div className="flex-grow min-w-0 overflow-hidden">
                      <p className="text-xs sm:text-sm text-gray-500 break-words">
                        ID: {entry.user.user_id}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5 break-words">
                        Device Gate: {entry.device.id}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5 break-words leading-tight">
                        Date/Time: {formatEntryDateTime(entry.datetime)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 bg-gray-100 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">
                      Remarks: {entry.remarks || "No remarks"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={`sm:max-w-md ${
            selectedEntry ? getBorderColorClass(selectedEntry) : ""
          }`}
        >
          <DialogHeader>
            <DialogTitle>Entry Details</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-3">
              {/* User info with image */}
              <div className="flex items-center gap-3 mb-2">
                <Image
                  src={selectedEntry.userImage || "/default-user-icon.png"}
                  alt={selectedEntry.user.name}
                  width={90}
                  height={90}
                  className="rounded-full object-cover"
                />
                <div>
                  <h3 className="font-medium text-gray-900">
                    {selectedEntry.user.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    ID: {selectedEntry.user.user_id}
                  </p>
                </div>
              </div>

              {/* Details section */}
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Turnstile:</span>{" "}
                  {selectedEntry.device.id}
                </p>

                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Date/Time:</span>{" "}
                  {formatEntryDateTime(selectedEntry.datetime)}
                </p>

                {selectedEntry.livedName && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Lived Name:</span>{" "}
                    {selectedEntry.livedName}
                  </p>
                )}

                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Status:</span>{" "}
                  {selectedEntry.disabled === "true" ? "Disabled" : "Active"}
                </p>

                {/* {selectedEntry.expiryDate && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">Expiry Date:</span>{" "}
                    {new Date(selectedEntry.expiryDate).toLocaleDateString()}
                  </p>
                )} */}
              </div>

              {/* Remarks section */}
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm font-medium text-gray-700">Remarks</p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedEntry.remarks || "No remarks"}
                </p>
              </div>

              <DialogClose asChild>
                <Button className="w-full mt-2" variant="outline">
                  Close
                </Button>
              </DialogClose>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
