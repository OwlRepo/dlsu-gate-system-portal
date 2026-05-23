"use client";
import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ReportsHeader } from "./ReportsPageContainer";

interface ReportsTableProps {
  data: ReportsHeader[];
  columns: {
    header: string;
    accessor: keyof ReportsHeader;
  }[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  total: number;
  limit: number;
  onRowClick?: (row: ReportsHeader) => void; // Add this prop
}

const ReportsTable: React.FC<ReportsTableProps> = ({
  data,
  columns,
  currentPage,
  onPageChange,
  onLimitChange,
  total,
  limit,
  onRowClick
}) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (currentPage - 1) * limit;
  const endIndex = Math.min(startIndex + data.length, total);

  const getStatusColor = (status: string) => {
    return status.split(";")[0] || "N/A";
  };

  // Add validation for current page
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      onPageChange(totalPages);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F4F7FCBF] text-slate-800">
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="p-3 text-left font-semibold text-[#0F416D]"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-[#F4F7FCBF]"
                  }`}
                  onClick={() => onRowClick && onRowClick(row)}
                >
                  {columns.map((column, colIndex) => (
                    <td key={colIndex} className="p-3 text-[#0F416D]">
                      {column.accessor === "STATUS" ? (
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
                      ) : (
                        row[column.accessor]
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
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
          {total > 0 ? `${startIndex + 1}-${endIndex} of ${total}` : "0 of 0"}
        </div>
        <div className="flex items-center space-x-2">
          <Select
            value={limit.toString()}
            onValueChange={(value) => onLimitChange(Number(value))}
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
            onClick={() => onPageChange(currentPage - 1)}
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
            onClick={() => onPageChange(currentPage + 1)}
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
};

export default ReportsTable;
