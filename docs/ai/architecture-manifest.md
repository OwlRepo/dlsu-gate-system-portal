# Architecture Manifest

Purpose:

Navigate and understand system structure before detailed file inspection.

This file is map only.

It is not proof of behavior.

Verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTEXT DRIFT`.

## Project Shape

TODO: Fill after repository analysis. Do not treat as verified.

Key facts needed:

- Monorepo structure (yarn workspaces / pnpm / lerna / turborepo / etc.)
- Main packages/apps
- Shared packages
- Deployment targets

## Frontend

TODO: Fill after repository analysis. Do not treat as verified.

Key areas:

- Technology stack
- Entry point and bootstrap
- Component architecture
- State management
- Styling approach
- Testing frameworks
- Build tools

## Backend

TODO: Fill after repository analysis. Do not treat as verified.

Key areas:

- Technology stack
- Entry point and bootstrap
- Dependency injection / module structure
- API route structure
- Service layer architecture
- Error handling
- Logging
- Testing frameworks
- Database ORM/query layer

## Database / Schema

TODO: Fill after repository analysis. Do not treat as verified.

Key areas:

- Database type (PostgreSQL, MySQL, MongoDB, SQLite, etc.)
- Schema location
- Migration strategy
- Key models/tables
- Relationships
- Constraints

## API Contracts

TODO: Fill after repository analysis. Do not treat as verified.

Key areas:

- Authentication method (JWT, session, etc.)
- Authorization model (role-based, permission-based, etc.)
- Standard response format
- Error response format
- API versioning strategy
- Pagination strategy

## Auth / Permissions

TODO: Fill after repository analysis. Do not treat as verified.

Key areas:

- User model structure
- Authentication flow
- Authorization rules
- Role/permission model
- Token strategy (JWT, sessions, etc.)
- Token expiration and refresh

## Jobs / Automations

TODO: Fill after repository analysis. Do not treat as verified.

Key areas:

- Job queue system (Bull, RabbitMQ, etc.)
- Scheduling system
- Background job types
- Retry strategy
- Failure handling

## Verification Commands

Commands to verify project builds and tests pass.

Verify from package.json or repo docs:

TODO: Fill after repository analysis. Do not treat as verified.

Example structure:

```
Type checking:  [command or "not available"]
Linting:        [command or "not available"]
Unit tests:     [command or "not available"]
Integration:    [command or "not available"]
E2E tests:      [command or "not available"]
Build:          [command or "not available"]
```
