---
type: "bfs"
date: "2026-08-11T14:11:28.134415+00:00"
question: "Should Root Tooling Scripts be split?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["scripts", "ROOT", "config", "Module"]
---

# Q: Should Root Tooling Scripts be split?

## Answer

Expansion: scripts, root, config, module. No architectural split. The 56-node star is one apps/backend/package.json manifest, so low cohesion is expected. Keep aliases, namespace command families, and extract only complex or platform-specific shell bodies into versioned scripts with safety guards.

## Outcome

- Signal: useful

## Source Nodes

- scripts
- ROOT
- config
- Module