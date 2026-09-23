import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "nestjs-backend-dev",
  filePrefix: "09",
  description:
    "Use proactively to implement NestJS controllers, services, DTOs, guards and database-sync/BioStar logic in apps/backend against a locked contract. Never touches migrations or entities (database-architect) or apps/portal-web (nextjs-frontend-dev).",
  claude: {
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: ["apps/backend/src/**"],
  systemPrompt: readFileSync(join(dir, "prompts", "nestjs-backend-dev.md"), "utf8").trimEnd() + "\n",
};

export default persona;
