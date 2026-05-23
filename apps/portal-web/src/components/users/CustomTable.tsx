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
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  CircleX,
  PenSquare,
  // Trash2,
  User,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { CustomDropdown } from "./CustomDropdown";
import Cookies from "js-cookie";

interface PaginatedTableProps<T> {
  data: T[];
  columns: {
    header: string;
    accessor: keyof T | string;
    cell?: (item: T) => React.ReactNode;
  }[];
  initialItemsPerPage?: number;
  onView?: (user: T) => void;
  onEdit?: (user: T) => void;
  onDeactivate?: (user: T) => void;
  onActivate?: (user: T) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  total: number;
  limit: number;
  isLoading?: boolean;
}

function CustomTable<T extends Record<string, unknown>>({
  data,
  columns,
  onView,
  onEdit,
  // onDelete,
  onDeactivate,
  onActivate,
  currentPage,
  onPageChange,
  onLimitChange,
  total,
  limit,
  isLoading = false,
}: PaginatedTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (currentPage - 1) * limit;
  const endIndex = Math.min(startIndex + data.length, total);

  const userInfo = JSON.parse(Cookies.get("user") as string);

  const roleColors: Record<string, string> = {
    admin: "bg-green-100 text-green-600",
    employee: "bg-purple-100 text-purple-600",
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
        <Table className="w-full text-sm ">
          <TableHeader>
            <TableRow className="bg-[#F4F7FCBF] text-slate-800 hover:bg-[#F4F7FCBF]">
              {columns.map((column, index) => (
                <TableHead
                  key={index}
                  className="p-3 text-left font-semibold text-[#0F416D]"
                >
                  {column.header ? column.header.toUpperCase() : ""}
                </TableHead>
              ))}
              <TableHead className="p-3 text-left font-semibold">
                {/* Empty header for dropdown column */}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 1 }).map((_, rowIndex) => (
                <TableRow
                  key={`loading-${rowIndex}`}
                  className={`${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-[#F4F7FCBF]"
                  }`}
                >
                  {columns.map((_, colIndex) => (
                    <TableCell key={`skeleton-${colIndex}`} className="p-3">
                      <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
                    </TableCell>
                  ))}
                  <TableCell className="p-3">
                    <div className="h-6 w-8 bg-gray-200 rounded animate-pulse"></div>
                  </TableCell>
                </TableRow>
              ))
            ) : data.length > 0 ? (
              // Render actual data rows
              data.map((row, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  className={`${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-[#F4F7FCBF]"
                  } hover:${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-[#F4F7FCBF]"
                  }`}
                >
                  {columns.map((column, colIndex) => (
                    <TableCell key={colIndex} className="p-3 text-[#0F416D]">
                      {column.accessor === "ROLE" ? (
                         <Badge
                         className={`${
                           roleColors[row[column.accessor] as string]
                         } rounded-lg font-normal hover:${
                           roleColors[row[column.accessor] as string]
                         }`}
                       >
                         {row[column.accessor] === "employee" 
                           ? "OPERATOR" 
                           : (row[column.accessor] as string).toUpperCase()}
                       </Badge>
                      ) : column.accessor === "DATE_ADDED" ? (
                        new Date(
                          row[column.accessor] as string
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      ) : column.cell ? (
                        column.cell(row)
                      ) : (
                        (row[column.accessor] as React.ReactNode)
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="p-3">
                    <CustomDropdown
                      actions={[
                        {
                          icon: <User className="h-4 w-4 text-gray-500" />,
                          label: "View Profile",
                          onClick: () => onView && onView(row),
                          disabled: false,
                        },
                        {
                          icon: <PenSquare className="h-4 w-4 text-gray-500" />,
                          label: "Edit Details",
                          onClick: () => onEdit && onEdit(row),
                          disabled: false,
                        },
                        // {
                        //   icon: <CirclePower className="h-4 w-4 text-gray-500" />,
                        //   label: "Deactivate User",
                        //   onClick: () => onDeactivate && onDeactivate(row),
                        //   disabled: (
                        //     // Condition 1: Is this the current user trying to delete themselves?
                        //     ((row as any).EMPLOYEE_ID === (
                        //       userInfo.user.role === 'super-admin'
                        //         && userInfo.user.super_admin_id
                        //     )) 
                        //     ||
                        //     // Condition 2: Is the current user NOT a super-admin?
                        //     (userInfo.user.role !== 'super-admin')
                        //   ),
                        // },

                        /* eslint-disable @typescript-eslint/no-explicit-any */
                        ...(((row as any).STATUS === true || (row as any).STATUS === "Active") ? [
                          {
                            icon: <CircleX className="h-4 w-4 text-gray-500" />,
                            label: "Deactivate User",
                            onClick: () => onDeactivate && onDeactivate(row),
                            disabled: (
                              // Condition 1: Is this the current user trying to delete themselves?
                              /* eslint-disable @typescript-eslint/no-explicit-any */
                              ((row as any).EMPLOYEE_ID === (
                                userInfo.user.role === 'super-admin'
                                  && userInfo.user.super_admin_id
                              )) 
                              ||
                              // Condition 2: Is the current user NOT a super-admin?
                              (userInfo.user.role !== 'super-admin')
                            ),
                          }
                        ] : [
                          // Show activate option instead when STATUS is inactive (false or "Inactive")
                          {
                            icon: <CircleCheckBig className="h-4 w-4" />,
                            label: "Activate User",
                            onClick: () => onActivate && onActivate(row),
                            disabled: (
                              // Condition 1: Is this the current user trying to delete themselves?
                              /* eslint-disable @typescript-eslint/no-explicit-any */
                              ((row as any).EMPLOYEE_ID === (
                                userInfo.user.role === 'super-admin'
                                  && userInfo.user.super_admin_id
                              )) 
                              ||
                              // Condition 2: Is the current user NOT a super-admin?
                              (userInfo.user.role !== 'super-admin')
                            ),
                          }
                        ]),
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              // No data state
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="p-3 text-center text-[#0F416D]"
                >
                  No user found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium text-muted-foreground">
          {Math.min(startIndex + 1, data.length)}-
          {Math.min(endIndex, data.length)} of {data.length}
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
}

export default CustomTable;
