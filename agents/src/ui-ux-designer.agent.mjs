import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "ui-ux-designer",
  filePrefix: "04",
  description:
    "Use proactively when writing UI copy, empty/loading/error states, or reviewing UX flows in the admin and employee dashboards.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Edit", "Write"],
    model: "sonnet",
  },
  ownedGlobs: [],
  systemPrompt: readFileSync(join(dir, "prompts", "ui-ux-designer.md"), "utf8").trimEnd() + "\n",
};

export default persona;
