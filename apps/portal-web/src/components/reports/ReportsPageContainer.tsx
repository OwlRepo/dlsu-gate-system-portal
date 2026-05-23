"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
// import CustomTable from "../custom/CustomTable";
import { headers } from "@/lib/column-headers";
import { Input } from "../ui/input";
import { ReportData } from "@/lib/types";
// import axios from "axios";
import axios from '@/lib/axios-interceptor';
import Cookies from "js-cookie";
import ReportsTable from "./ReportsTable";
import CustomFilter, { FilterItem } from "../custom/CustomFilter";
import { useToast } from "@/hooks/use-toast";
import CustomExport from "../custom/CustomExport";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

export interface ReportsHeader {
  STATUS: string;
  ID: string;
  NAME: string;
  ACTIVITY: string;
  DATETIME?: string;
  REMARKS?: string;
}

const ReportsPageContainer = () => {
  const { toast } = useToast();

  const [search, setSearch] = useState<string>("");
  const [reportsList, setReportsList] = useState<ReportData[]>([]);
  const [limit, setLimit] = useState<number>(10);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [selectedData, setSelectedData] = useState<ReportsHeader | null>(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>("");
  const latestRequestIdRef = useRef(0);

  const typeOptions = ["1", "2"];

  const fetchReportsList = useCallback(async (
    searchTerm: string = "",
    newLimit?: number,
    newPage?: number,
    filters?: FilterItem[]
  ) => {
    const requestId = ++latestRequestIdRef.current;

    try {
      const user = Cookies.get("user");
      const token = user ? JSON.parse(user).token : null;

      // Use new values if provided, otherwise use state values
      const currentLimit = newLimit ?? limit;
      const currentPage = newPage ?? page;
      const currentFilters = filters ?? activeFilters;

      // Build query parameters
      const params = new URLSearchParams();
      if (searchTerm) params.append("searchTerm", searchTerm);
      if (currentLimit) params.append("limit", currentLimit.toString());
      if (currentPage) params.append("page", currentPage.toString());

      // Add filter parameters only if they have complete values
      currentFilters.forEach((filter) => {
        if (filter.type === "type" && filter.value.type) {
          params.append("type", filter.value.type);
        }

        if (filter.type === "dateRange") {
          // Only append date parameters if BOTH dates are provided
          if (filter.value.dateFrom && filter.value.dateTo) {
            params.append("startDate", filter.value.dateFrom);
            params.append("endDate", filter.value.dateTo);
          }
        }
      });

      const queryString = params.toString();
      const url = `${process.env.NEXT_PUBLIC_API_URL}/reports${
        queryString ? `?${queryString}` : ""
      }`;

      const res = await axios.get(url, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `${token}`,
        },
      });

      if (res.data) {
        if (requestId !== latestRequestIdRef.current) {
          return;
        }

        setReportsList(res.data.items);
        setTotal(res.data.total);
        // Optional success toast
        toast({
          title: "Success",
          description: "Reports fetched successfully",
          duration: 3000,
        });
      }
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) {
        return;
      }

      // Handle errors here
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.message ||
          "An error occurred while fetching reports";
        const errorStatus = error.response?.status;

        // Show toast notification with the error message
        toast({
          variant: "destructive",
          title: `Error ${errorStatus || ""}`,
          description: errorMessage,
          duration: 5000,
        });
      } else {
        // Handle non-Axios errors
        toast({
          variant: "destructive",
          title: "Error",
          description: "An unexpected error occurred",
          duration: 5000,
        });
        console.error(error);
      }
    }
  }, [activeFilters, limit, page, toast]);

  const handleFiltersChange = (newFilters: FilterItem[]) => {
    // Only consider filters that have valid values
    const validFilters = newFilters.filter((filter) => {
      if (filter.type === "type") {
        return !!filter.value.type; // Only include if userType is set
      }

      if (filter.type === "dateRange") {
        // Include only if BOTH dates are set
        return !!filter.value.dateFrom && !!filter.value.dateTo;
      }

      return false; // Ignore other filter types
    });

    setActiveFilters(validFilters);
    // Reset to page 1 when filters change
    setPage(1);
  };

  const handleExport = async (settings: {
    includePhoto?: boolean;
    dateFrom: string;
    dateTo: string;
  }) => {
    setExportLoading(true);
    try {
      const user = Cookies.get("user");
      const token = user ? JSON.parse(user).token : null;

      // Build URL with query parameters
      const params = new URLSearchParams();
      if (settings.includePhoto) {
        params.append("includePhoto", settings.includePhoto.toString());
      }
      params.append("startDate", settings.dateFrom);
      params.append("endDate", settings.dateTo);

      const url = `${
        process.env.NEXT_PUBLIC_API_URL
      }/reports/generate-csv?${params.toString()}`;

      const res = await axios.get(url, {
        responseType: "blob",
        headers: {
          Authorization: `${token}`,
        },
      });

      // Create a blob from the response data
      const blob = new Blob([res.data], { type: "text/csv" });

      // Create a download link and trigger the download
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = `reports_${settings.dateFrom}_to_${settings.dateTo}.csv`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setExportLoading(false);

      toast({
        title: "Export Successful",
        description: "Report data has been exported successfully",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error exporting data:", error);
      setExportLoading(false);
      toast({
        title: "Export Error",
        description: "An error occurred while exporting data",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  // Add handlers for pagination
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(search);
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  const formatDateTime = (dateStr: string | Date | undefined) => {
    if (!dateStr) return "N/A";
    try {
      const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      if (isNaN(date.getTime())) return "N/A";
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch {
      return "N/A";
    }
  };

  const data = reportsList.map((row) => ({
    STATUS: row.status ? row.status : "N/A",
    ID: row.user_id ? row.user_id : "N/A",
    NAME: row.name ? row.name : "N/A",
    ACTIVITY: row.activity
      ? row.activity
      : row.type
      ? (row.type === "1" ? "IN" : "OUT")
      : "N/A",
    DATETIME: formatDateTime(row.datetime),
    REMARKS: row.remarks ? row.remarks : "N/A",
  }));

  useEffect(() => {
    fetchReportsList(debouncedSearchTerm, limit, page, activeFilters);
  }, [activeFilters, debouncedSearchTerm, fetchReportsList, limit, page]);

  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setPage(1);
  };

  // const refetchReportsList = () => {
  //   fetchReportsList(search, limit, page, activeFilters);
  // };

  console.log(selectedData);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="flex items-center justify-between mb-8">
        <div className="w-[500px]">
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={handleSearch}
          />
        </div>

        <div className="flex items-center gap-4">
          <CustomFilter
            onFiltersChange={handleFiltersChange}
            typeOptions={typeOptions}
          />

          <CustomExport
            onExport={handleExport}
            loading={exportLoading}
            showIncludePhoto
          />
        </div>
      </div>
      <ReportsTable
        columns={headers}
        data={data}
        onPageChange={handlePageChange}
        onLimitChange={handleLimitChange}
        currentPage={page}
        total={total}
        limit={limit}
        onRowClick={(row) => {
          setSelectedData(row);
          setIsDialogOpen(true);
        }}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Details</DialogTitle>
          </DialogHeader>
          {selectedData &&
            (() => {

              return (
                <div className="flex gap-4 items-center">
                  <div className="space-y-4 w-full">
                    <div className="flex flex-col gap-4">
                      <div className="space-2">
                        <p className="text-sm font-medium text-green-500">
                          ID : {selectedData.ID}
                        </p>

                        <div className="flex items-center justify-between">
                        <p className="text-xl font-semibold">
                          {selectedData.NAME}
                        </p>
                        <p className="text-m text-muted-foreground">
                          {selectedData.ACTIVITY}
                        </p>
                        </div>
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
                          {selectedData.REMARKS || undefined}
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
};

export default ReportsPageContainer;
