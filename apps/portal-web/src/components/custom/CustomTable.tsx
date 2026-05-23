"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ScanDetailStatus } from "@/lib/types";

interface PaginatedTableProps<T> {
  data: T[];
  columns: {
    header: string;
    accessor: keyof T | string;
    cell?: (item: T) => React.ReactNode;
  }[];
  isLive?: boolean;
  initialItemsPerPage?: number;
  onRowClick?: (row: T) => void;
}

function CustomTable<T extends Record<string, unknown>>({
  data,
  columns,
  initialItemsPerPage = 10,
  isLive = false,
  onRowClick,
}: PaginatedTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);

  const totalPages = Math.ceil(data.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = data.slice(startIndex, endIndex);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const getStatusColor = (status: string) => {
    return status.split(";")[0] || "N/A";
  };

  // should put in utils in the future
  const checkExpiry = (expiryDate: string | undefined) => {
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      const today = new Date();
      return today > expiry;
    }
    return false;
  };


  const getLiveStatusColor = (scanDetail?: ScanDetailStatus): string => {
    if (!scanDetail) return "N/A";
    
    const isExpired = checkExpiry(scanDetail.expiryDate);
    const isDisabled = scanDetail.disabled === "true";
    const hasRemarks = scanDetail.remarks !== "No remarks" && scanDetail.remarks !== null;
    const isApb = scanDetail.eventTypeId && scanDetail.eventTypeId.includes("APB") || scanDetail.event && scanDetail.event.includes("APB");
    
    if (isExpired || isDisabled || isApb) return "RED";
    if (!isExpired && scanDetail.disabled === "false" && hasRemarks) return "YELLOW";
    if (scanDetail.remarks === "No remarks" || scanDetail.remarks === null) return "GREEN";
    
    return "N/A";
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm ">
          <thead>
            <tr className="bg-[#F4F7FCBF] text-slate-800">
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="p-3 text-left font-semibold  text-[#0F416D]"
                >
                  {column.header ? column.header.toUpperCase() : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-[#F4F7FCBF]"
                  } hover:${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-[#F4F7FCBF]"
                  } ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column, colIndex) => (
                    <td key={colIndex} className="p-3  text-[#0F416D]">
                      {column.accessor === "STATUS" ? (
                        isLive ? (
                          <div
                          className={`h-2 w-2 rounded-full ${
                            getLiveStatusColor(row[column.accessor] as ScanDetailStatus) === "GREEN"
                              ? "bg-[#00C853]"
                              : getLiveStatusColor(row[column.accessor] as ScanDetailStatus) === "YELLOW"
                              ? "bg-[#FFB300]"
                              : "bg-[#F44336]"
                          }`}
                          />
                        ) : (
                          <div
                            className={`h-2 w-2 rounded-full ${
                              getStatusColor(row[column.accessor] as string) ===
                              "GREEN"
                                ? "bg-[#00C853]"
                                : getStatusColor(
                                    row[column.accessor] as string
                                  ) === "YELLOW"
                                ? "bg-[#FFB300]"
                                : "bg-[#F44336]"
                            }`}
                          />
                        )
                      ) : column.cell ? (
                        column.cell(row)
                      ) : (
                        (row[column.accessor] as React.ReactNode)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="p-3 text-center text-[#0F416D]"
                >
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium text-muted-foreground">
          {Math.min(startIndex + 1, data.length)}-
          {Math.min(endIndex, data.length)} of {data.length}
        </div>
        <div className="flex items-center space-x-2">
          <Select
            value={itemsPerPage.toString()}
            onValueChange={handleItemsPerPageChange}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Items per page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 per page</SelectItem>
              <SelectItem value="10">10 per page</SelectItem>
              <SelectItem value="20">20 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            variant="outline"
            size="sm"
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm">
            {currentPage}/{totalPages}
          </span>
          <Button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            variant="outline"
            size="sm"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CustomTable;
