import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const persona = {
  name: "nextjs-frontend-dev",
  filePrefix: "03",
  description:
    "Use proactively to implement portal-web (Next.js 15 App Router, React 19, shadcn/Radix, Tailwind) pages, components, hooks, stores and API clients against a locked backend contract. Owns apps/portal-web/src; never edits apps/backend.",
  claude: {
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
    model: "sonnet",
  },
  ownedGlobs: ["apps/portal-web/src/**"],
  systemPrompt: readFileSync(join(dir, "prompts", "nextjs-frontend-dev.md"), "utf8").trimEnd() + "\n",
};

export default persona;
