import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "database-architect",
  filePrefix: "02",
  description:
    "Use proactively when a change needs a TypeORM entity or migration (apps/backend/src/migrations, apps/backend/src/**/entities). Runs alone, before the contract lock, never in the concurrent backend/frontend round.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: ["apps/backend/src/migrations/**", "apps/backend/src/**/entities/**"],
  systemPrompt: readFileSync(join(dir, "prompts", "database-architect.md"), "utf8").trimEnd() + "\n",
};

export default persona;
