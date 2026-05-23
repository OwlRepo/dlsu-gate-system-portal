import { http, HttpResponse } from "msw";
import { mockGateAnalytics, mockReports } from "@/mocks/data/reports";

const paginate = (page: number, limit: number) => {
  const start = (page - 1) * limit;
  const end = start + limit;
  return mockReports.slice(start, end);
};

export const reportsHandlers = [
  http.get("*/reports", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname !== "/reports") {
      return;
    }

    const page = Number(url.searchParams.get("page") || 1);
    const limit = Number(url.searchParams.get("limit") || 10);
    const searchTerm = (url.searchParams.get("searchTerm") || "").toLowerCase();

    const filtered = mockReports.filter((report) => {
      if (!searchTerm) return true;
      return (
        report.name.toLowerCase().includes(searchTerm) ||
        report.remarks.toLowerCase().includes(searchTerm)
      );
    });

    const paged = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

    return HttpResponse.json({
      items: paged,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    });
  }),

  http.post("*/reports", async () => {
    return HttpResponse.json({ success: true, message: "Report accepted (mock)" });
  }),

  http.get("*/reports/analytics/gates", () => HttpResponse.json(mockGateAnalytics)),

  http.get("*/reports/generate-csv", () => {
    const csv = [
      "Time stamp,ID Number,Name,Status,Device,Gate",
      ...mockReports.map(
        (row) =>
          `${row.datetime},${row.user_id},${row.name},${row.status},${row.device},${row.gate ?? ""}`
      ),
    ].join("\n");

    return new HttpResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
      },
    });
  }),
];
