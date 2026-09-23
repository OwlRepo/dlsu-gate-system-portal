import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "accessibility-auditor",
  filePrefix: "08",
  description:
    "Use proactively before marking user-facing portal-web changes done. WCAG 2.1 AA check: keyboard, focus, labels, contrast in light and dark. Read-only.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: [],
  systemPrompt: readFileSync(join(dir, "prompts", "accessibility-auditor.md"), "utf8").trimEnd() + "\n",
};

export default persona;
