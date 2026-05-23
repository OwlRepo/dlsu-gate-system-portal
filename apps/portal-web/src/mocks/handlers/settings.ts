import { http, HttpResponse } from "msw";
import { mockSchedules } from "@/mocks/data/settings";
import { mockScreensaver } from "@/mocks/data/screensaver";

export const settingsHandlers = [
  http.get("*/database-sync/schedules", () => HttpResponse.json(mockSchedules)),
  http.post("*/database-sync/schedule", async ({ request }) => {
    const body = (await request.json()) as { scheduleNumber?: number; time?: string };
    return HttpResponse.json({
      success: true,
      message: `Schedule ${body.scheduleNumber ?? "?"} set to ${body.time ?? "--"} (mock)`,
    });
  }),

  http.post("*/database-sync/sync", () =>
    HttpResponse.json({ success: true, message: "Manual sync completed (mock)" })
  ),

  http.post("*/database-sync/biostar/sync", () =>
    HttpResponse.json({ success: true, message: "Biostar sync completed (mock)" })
  ),

  http.post("*/database-sync/delete-users", () =>
    HttpResponse.json({ success: true, message: "Users deleted (mock)" })
  ),

  http.get("*/screensaver", () => HttpResponse.json(mockScreensaver)),
  http.post("*/screensaver/upload", () =>
    HttpResponse.json({ success: true, message: "Screensaver uploaded (mock)" })
  ),
];
