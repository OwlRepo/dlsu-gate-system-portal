---
type: "bfs"
date: "2026-08-11T14:11:28.075367+00:00"
question: "Should Super Admin Controller be split?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["SuperAdminController", "SuperAdminService", "SuperAdmin", "CreateAdminDto"]
---

# Q: Should Super Admin Controller be split?

## Answer

Expansion: super, admin, controller, service, module. Split service responsibilities, not the cohesive four-route controller yet. Move runtime DDL to migrations, default-account setup to an idempotent seeder, isolate ID generation, and separate provisioning from query and mutation operations.

## Outcome

- Signal: useful

## Source Nodes

- SuperAdminController
- SuperAdminService
- SuperAdmin
- CreateAdminDto