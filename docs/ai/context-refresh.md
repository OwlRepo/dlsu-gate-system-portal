# Context Refresh

Purpose:

Refresh AI navigation and contract docs without changing source code.

Use this when context docs become stale or incomplete.

This is read-only for source code. Only context docs may be edited.

## Scope

- Update `docs/ai/module-ownership-map.md`
- Update `docs/ai/contracts/api-contracts.md`
- Update `docs/ai/contracts/db-contracts.md`
- Update `docs/ai/testing-strategy.md`
- Update `docs/ai/risk-register.md`
- Update `docs/ai/architecture-manifest.md`
- Update `docs/ai/file-index/repository-map.md`

Do not change source code.

Do not plan implementation.

Do not implement features.

Do not commit source code changes.

## Files To Refresh

### `docs/ai/module-ownership-map.md`

- Identify all product/business domains
- For each domain: frontend area, backend area, database/schema, jobs/automations, integrations, tests
- Verify domain risk level (Tiny, Express, Standard, Deep)
- Update all TODO entries with real findings or leave marked as TODO if still unknown

### `docs/ai/contracts/api-contracts.md`

- Identify all important FE-BE API contracts
- For each contract: domain, feature, method, endpoint, caller, handler, request shape, response shape, auth/permission
- Verify against source code types and route definitions
- Update all TODO entries with real findings or leave marked as TODO if still unknown

### `docs/ai/contracts/db-contracts.md`

- Identify all important database models/tables
- For each model: owner module, important fields, invariants, mutation paths, transaction rules, related APIs/jobs
- Verify against schema, migrations, services, jobs
- Update all TODO entries with real findings or leave marked as TODO if still unknown

### `docs/ai/testing-strategy.md`

- Discover all type checking commands from package scripts/repo docs
- Discover all linting commands from package scripts/repo docs
- Discover all testing commands from package scripts/repo docs
- Discover all build commands from package scripts/repo docs
- List verified commands only
- Mark commands as "not available" if environment does not support them

### `docs/ai/risk-register.md`

- For each listed risk area, verify whether it applies to this project
- Identify additional risk areas specific to project
- Update checks, manual QA, and notes with project-specific guidance

### `docs/ai/architecture-manifest.md`

- Update project shape (monorepo, microservices, etc.)
- Describe frontend architecture
- Describe backend architecture
- Describe database/schema structure
- Summarize API contracts
- Describe auth/permissions model
- Describe jobs/automations
- List verification commands

## Source Verification Rules

All facts must be verified from:

- Source code files
- Test suites
- Type definitions
- Database schema / migrations
- API route definitions
- Controller/service definitions
- Component definitions
- Package.json scripts
- CI/CD workflow files
- README and deployment docs

Do not invent. If something is not found in source, leave marked as TODO.

## Drift Markers

When updating, mark entries that conflict with source:

- `CONTEXT DRIFT` - context doc is stale/wrong
- `CONTRACT DRIFT` - contract map is stale/wrong
- Use source code as truth
- Report stale section

When content is still unknown, mark:

- `TODO: Fill after repository analysis. Do not treat as verified.`

## Refresh Steps

1. Open `docs/ai/module-ownership-map.md`
   - Search source code for domain-related features
   - Update frontend/backend/database/jobs columns
   - Verify domain risk classification
   - Save

2. Open `docs/ai/contracts/api-contracts.md`
   - Find all important FE-BE endpoints
   - Verify request/response shapes from source types
   - Verify auth/permission from route guards
   - Update map
   - Save

3. Open `docs/ai/contracts/db-contracts.md`
   - Find all important models from schema/migrations
   - Identify invariants from service code
   - Identify mutation paths from services/jobs
   - Update map
   - Save

4. Open `docs/ai/testing-strategy.md`
   - Run `cat package.json` and find scripts
   - Test each candidate command to verify it works
   - Update command lists
   - Document any blocked commands
   - Save

5. Open `docs/ai/risk-register.md`
   - For each risk area: search source for related code
   - Update required checks and manual QA based on findings
   - Add project-specific risk areas if any
   - Save

6. Open `docs/ai/architecture-manifest.md`
   - Describe project structure from file/directory inspection
   - Describe frontend stack and patterns
   - Describe backend stack and patterns
   - Update all sections
   - Save

7. Open `docs/ai/file-index/repository-map.md`
   - List key directories and files
   - Add new files discovered
   - Mark unused/deprecated entries
   - Save

## Output Summary

After context refresh:

```txt
## Refreshed Files

- docs/ai/module-ownership-map.md - [X domains updated]
- docs/ai/contracts/api-contracts.md - [X contracts verified/updated]
- docs/ai/contracts/db-contracts.md - [X models verified/updated]
- docs/ai/testing-strategy.md - [X commands verified]
- docs/ai/risk-register.md - [X areas reviewed]
- docs/ai/architecture-manifest.md - [full refresh]
- docs/ai/file-index/repository-map.md - [X entries updated]

## Drift Found

[List CONTEXT DRIFT and CONTRACT DRIFT entries]

## Still Unknown (TODO entries)

[List items still requiring analysis]

## Verification

- All facts verified against source code/tests/types/schemas/routes
- No source code changes made
- All drift marked with source reference
- Ready for use in next task
```
