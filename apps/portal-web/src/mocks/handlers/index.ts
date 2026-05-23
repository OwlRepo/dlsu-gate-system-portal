import { authHandlers } from "@/mocks/handlers/auth";
import { biostarProxyHandlers } from "@/mocks/handlers/biostar-proxy";
import { reportsHandlers } from "@/mocks/handlers/reports";
import { settingsHandlers } from "@/mocks/handlers/settings";
import { usersHandlers } from "@/mocks/handlers/users";

export const handlers = [
  ...authHandlers,
  ...reportsHandlers,
  ...usersHandlers,
  ...settingsHandlers,
  ...biostarProxyHandlers,
];
