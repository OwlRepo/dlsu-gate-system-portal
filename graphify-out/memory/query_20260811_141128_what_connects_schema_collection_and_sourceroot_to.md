---
type: "bfs"
date: "2026-08-11T14:11:28.089307+00:00"
question: "What connects schema collection and sourceRoot to the rest of the system?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["$schema", "collection", "sourceRoot", "NestJS Backend API"]
---

# Q: What connects schema collection and sourceRoot to the rest of the system?

## Answer

Expansion: schema, collection, source, root, config, configuration. These nodes are Nest CLI metadata in apps/backend/nest-cli.json:2-7. They semantically configure Nest schematics, the src tree, and backend build/start commands; JSON keys have no runtime import edge. Preserve config and document the build-pipeline relationship.

## Outcome

- Signal: useful

## Source Nodes

- $schema
- collection
- sourceRoot
- NestJS Backend API