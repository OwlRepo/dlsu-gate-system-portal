import { http, HttpResponse } from "msw";
import { mockAuthValidate } from "@/mocks/data/auth";

export const authHandlers = [
  http.get("*/auth/validate", () => HttpResponse.json(mockAuthValidate)),
];
