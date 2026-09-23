import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "test-engineer",
  filePrefix: "07",
  description:
    "Use proactively to write the RED tests first: Jest specs for apps/backend, Vitest + Testing Library tests for apps/portal-web, node:test for scripts. Runs npm run tdd:red and commits the tests before any implementer starts.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: [],
  systemPrompt: readFileSync(join(dir, "prompts", "test-engineer.md"), "utf8").trimEnd() + "\n",
};

export default persona;
