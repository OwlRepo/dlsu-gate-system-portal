# API Contracts

Purpose:

Map important frontend-backend contracts.

This file is map only.

It is not proof of behavior.

Verify all conclusions against real source code, tests, types, schemas, routes, controllers, services, stores, components, API contracts, and database definitions.

If this map conflicts with source code, source code wins.

Mark stale or conflicting entries as `CONTRACT DRIFT`.

Mark missing contracts as `UNMAPPED CONTRACT`.

## Rules

- Use this map before FE-BE contract checks.
- Verify all API contracts against source code before conclusions.
- If frontend expectation and backend response differ, mark `CONTRACT MISMATCH`.
- If map conflicts with source code, mark `CONTRACT DRIFT`.
- If contract is missing from map, mark `UNMAPPED CONTRACT`.
- Do not invent request or response shapes.
- Unknown fields must be marked `TODO: Fill after repository analysis. Do not treat as verified.`

## Contract Index

| Domain | Feature | Method | Endpoint / Route | Frontend Caller | Backend Handler | Request Shape | Response Shape | Auth / Permission | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Gate Operations | Get Gate Status | GET | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO: Fill after repository analysis. Do not treat as verified. |
| Gate Operations | Update Gate Status | POST | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO: Fill after repository analysis. Do not treat as verified. |
| Auth / Permissions | User Login | POST | TODO | TODO | TODO | TODO | TODO | TODO | Deep | TODO: Fill after repository analysis. Do not treat as verified. |
| Auth / Permissions | User Logout | POST | TODO | TODO | TODO | TODO | TODO | TODO | Deep | TODO: Fill after repository analysis. Do not treat as verified. |
| Reporting / Analytics | Get Reports | GET | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO: Fill after repository analysis. Do not treat as verified. |
