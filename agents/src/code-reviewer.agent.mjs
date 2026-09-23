import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "code-reviewer",
  filePrefix: "05",
  description:
    "Use proactively before marking any change done. Read-only reviewer: spec compliance, correctness, conventions, the four gate-access invariants, and test quality.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: [],
  systemPrompt: readFileSync(join(dir, "prompts", "code-reviewer.md"), "utf8").trimEnd() + "\n",
};

export default persona;
