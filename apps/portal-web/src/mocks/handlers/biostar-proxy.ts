import { http, HttpResponse } from "msw";
import { mockDashboardScans } from "@/mocks/data/dashboard";
import { mockDevices } from "@/mocks/data/users";

export const biostarProxyHandlers = [
  http.post("/api/login", () => HttpResponse.json({ bsSessionId: "mock-bs-session-id" })),

  http.get("/api/users", ({ request }) => {
    const url = new URL(request.url);
    const userId = String(url.searchParams.get("params") || "2021-00001");

    const scan =
      mockDashboardScans.find((item) => item.user.user_id === userId) ||
      mockDashboardScans[0];

    return HttpResponse.json({
      data: {
        User: {
          user_id: scan.user.user_id,
          name: scan.user.name,
          photo_exist: false,
          photo: null,
          disabled: scan.disabled ?? "false",
          expiry_datetime: null,
          user_custom_fields: [
            { custom_field: { name: "Remarks" }, item: scan.remarks ?? "No remarks" },
            { custom_field: { name: "Lived Name" }, item: scan.livedName ?? scan.user.name },
            { custom_field: { name: "Gate" }, item: scan.gate ?? "Unknown Gate" },
          ],
        },
      },
    });
  }),

  http.post("/api/events", () =>
    HttpResponse.json({
      EventCollection: {
        rows: mockDashboardScans.map((scan) => ({
          user_id: scan.user.user_id,
          device_id: scan.device.id,
          datetime: scan.datetime,
          tna_key: scan.tnaKey,
          event_type_id: { name: scan.eventTypeId },
        })),
      },
    })
  ),

  http.get("/api/devices", () =>
    HttpResponse.json({
      data: {
        DeviceCollection: {
          rows: mockDevices,
        },
      },
    })
  ),
];
