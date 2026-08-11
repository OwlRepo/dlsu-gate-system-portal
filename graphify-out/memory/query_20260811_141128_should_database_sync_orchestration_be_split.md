---
type: "bfs"
date: "2026-08-11T14:11:28.075325+00:00"
question: "Should Database Sync Orchestration be split?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["DatabaseSyncController", "DatabaseSyncService", "DatabaseSyncQueueService", "SyncSchedule"]
---

# Q: Should Database Sync Orchestration be split?

## Answer

Expansion: database, sync, service, controller, module. Yes, highest priority. The 76-node community spans 4296 implementation lines. Extract schedule management and a single execution coordinator around existing lock and active-job invariants; isolate destructive user commands; then factor shared BioStar, CSV, and batch logic from path strategies.

## Outcome

- Signal: useful

## Source Nodes

- DatabaseSyncController
- DatabaseSyncService
- DatabaseSyncQueueService
- SyncSchedule