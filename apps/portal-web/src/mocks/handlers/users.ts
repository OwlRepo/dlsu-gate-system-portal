import { http, HttpResponse } from "msw";
import { mockDevices, mockUsers } from "@/mocks/data/users";
import { mockProfile } from "@/mocks/data/auth";

export const usersHandlers = [
  http.get("*/users", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname !== "/users") return;

    const search = (url.searchParams.get("search") || "").toLowerCase();
    const page = Number(url.searchParams.get("page") || 1);
    const limit = Number(url.searchParams.get("limit") || 10);

    const filtered = mockUsers.filter((user) =>
      [user.username, user.first_name, user.last_name, user.id]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );

    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return HttpResponse.json({
      items,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
    });
  }),

  http.post("*/users/bulk-deactivate", () =>
    HttpResponse.json({ success: true, message: "Users deactivated (mock)" })
  ),

  http.post("*/users/bulk-reactivate", () =>
    HttpResponse.json({ success: true, message: "Users reactivated (mock)" })
  ),

  http.get("*/users/generate-csv", () => {
    const csv = [
      "ID,Username,First Name,Last Name,Role,Status",
      ...mockUsers.map(
        (u) => `${u.id},${u.username},${u.first_name},${u.last_name},${u.userType},${u.is_active ? "Active" : "Inactive"}`
      ),
    ].join("\n");

    return new HttpResponse(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv" },
    });
  }),

  http.get("*/employee/:id", ({ params }) =>
    HttpResponse.json({
      data: {
        employee_id: params.id,
        device_id: [mockDevices[0].id, mockDevices[1].id],
      },
    })
  ),

  http.post("*/employee", () =>
    HttpResponse.json({ success: true, message: "Employee created (mock)" })
  ),

  http.patch("*/employee/:id", () =>
    HttpResponse.json({ success: true, message: "Employee updated (mock)" })
  ),

  http.patch("*/admin/:id", () =>
    HttpResponse.json({ success: true, message: "Admin updated (mock)" })
  ),

  http.patch("*/super-admin/:id", () =>
    HttpResponse.json({ success: true, message: "Super admin updated (mock)" })
  ),

  http.get("*/admin/:id", () => HttpResponse.json(mockProfile)),
  http.get("*/super-admin/:id", () => HttpResponse.json(mockProfile)),

  http.post("*/super-admin/create-admin", () =>
    HttpResponse.json({ success: true, message: "Admin created (mock)" })
  ),
  http.post("*/super-admin/register", () =>
    HttpResponse.json({ success: true, message: "Super admin created (mock)" })
  ),
];
