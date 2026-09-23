import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "project-manager",
  filePrefix: "01",
  description:
    "Use proactively before writing code for any feature or bug fix. Turns the request into an atomic spec with testable acceptance criteria, locks the backend/frontend contract, and states which personas the main session dispatches, in which round.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: [],
  systemPrompt: readFileSync(join(dir, "prompts", "project-manager.md"), "utf8").trimEnd() + "\n",
};

export default persona;
