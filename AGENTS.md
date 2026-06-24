# AI Agent Entry Point

Any AI coding agent working in this repository must start by reading:

## Load Order

1. `CLAUDE.md` - Claude's router/planner/handoff contract
2. `docs/ai/entry-point.md` - workflow summary and load order
3. `docs/ai/task-router.md` - task classification and routing
4. `docs/ai/module-ownership-map.md` - business/domain ownership map
5. `docs/ai/contracts/api-contracts.md` - FE-BE API contracts
6. `docs/ai/contracts/db-contracts.md` - database/model invariants
7. `docs/ai/testing-strategy.md` - verification expectations
8. `docs/ai/risk-register.md` - high-risk areas
9. `docs/ai/architecture-manifest.md` - system architecture map
10. `docs/ai/file-index/repository-map.md` - repository file index

Then follow routing, context-loading, planning, implementation, verification, and safety rules defined in these docs.

Always prioritize generated AI documentation before scanning repository files.

## Role Boundaries

**Claude:**
- Routes tasks through task-router.md
- Performs RCA / Discovery
- Plans implementation
- Writes .ai-scratchpad.md handoff
- Must not edit source code

**Codex:**
- Implements from .ai-scratchpad.md only
- Validates from .ai-scratchpad.md only
- Fixes implementation-caused errors only
- Must not perform RCA/planning
- Must not infer missing details

**Human:**
- Provides raw task details
- Approves RCA and plans
- Approves Deep task implementation
- Reviews final code
