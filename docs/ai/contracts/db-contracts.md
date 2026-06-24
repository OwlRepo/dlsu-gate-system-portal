# Database Contracts

Purpose:

Map important database models, ownership, and invariants.

This file is map only.

It is not proof of behavior.

Verify all DB contracts against schema, migrations, services, jobs, and tests.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTRACT DRIFT`.

Mark missing contracts as `UNMAPPED CONTRACT`.

## Rules

- Use this map before schema, billing, payment, SMS credit, automation, job, webhook, or transaction planning.
- Verify all DB contracts against schema, migrations, services, jobs, and tests.
- If mutation path bypasses required invariant, mark `CONTRACT MISMATCH`.
- If map conflicts with source code, mark `CONTRACT DRIFT`.
- If contract is missing from map, mark `UNMAPPED CONTRACT`.
- Do not invent invariants.
- Unknown fields must be marked `TODO: Fill after repository analysis. Do not treat as verified.`

## Contract Index

| Domain | Model / Table | Owner Module | Important Fields | Invariants | Mutation Paths | Transaction / Idempotency Rules | Related APIs / Jobs | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gate Operations | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO: Fill after repository analysis. Do not treat as verified. |
| Auth / Permissions | User | TODO | TODO | TODO | TODO | TODO | TODO | Deep | TODO: Fill after repository analysis. Do not treat as verified. |
| Reporting / Analytics | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO: Fill after repository analysis. Do not treat as verified. |
