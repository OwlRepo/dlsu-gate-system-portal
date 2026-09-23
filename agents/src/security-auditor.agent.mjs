import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "security-auditor",
  filePrefix: "06",
  description:
    "Use proactively on any change touching auth, roles, JWT, database-sync, BioStar, account management, uploads or secrets. Read-only; reports issues with a concrete fix.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: [],
  systemPrompt: readFileSync(join(dir, "prompts", "security-auditor.md"), "utf8").trimEnd() + "\n",
};

export default persona;
