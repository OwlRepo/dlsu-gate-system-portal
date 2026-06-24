# Risk Register

Purpose:

Map high-risk project areas.

This file is map only.

It is not proof of behavior.

Mark missing risk areas as `UNMAPPED RISK`.

## Rules

- If task touches listed high-risk area, default to Deep
- Only downgrade Deep if repository evidence proves task is isolated and low-risk
- Verify risk against source code and related contracts
- If risk area is missing, mark `UNMAPPED RISK`

## Risk Areas

| Risk Area | Why Risky | Default Task Size | Required Checks | Manual QA | Notes |
| --- | --- | --- | --- | --- | --- |
| Billing | Financial transactions and business critical | Deep | transaction atomicity, rollback tests, audit logs | full billing flow | verify money handling is correct |
| Payments | External payment processing, PCI scope | Deep | payment provider integration tests, encryption | end-to-end payment flow | involve payment team in review |
| SMS Credits | External service costs, accounting impact | Deep | credit calculation tests, reconciliation | credit transaction flow | verify cost tracking is accurate |
| Plan Upgrades | Customer-facing, billing impact, backward compatibility | Deep | upgrade path tests, downgrade tests | full upgrade flow | verify data preservation |
| Auth / Permissions | Security, user access control, privilege escalation | Deep | authentication tests, authorization boundaries, token tests | full login/logout flow | security review required |
| Automations | Background processes, data consistency, retry logic | Deep | automation trigger tests, idempotency tests, failure recovery | end-to-end automation | verify no duplicate processing |
| Jobs | Background processing, data mutations, concurrency | Deep | job queue tests, concurrency tests, failure recovery | job execution flow | verify atomicity and retry logic |
| Webhooks | External integrations, eventual consistency, retries | Deep | webhook handler tests, retry logic, signature verification | webhook delivery and retry | verify idempotency |
| Database Migrations | Data loss risk, deployment ordering, rollback complexity | Deep | migration up/down tests, data preservation tests | full migration flow | have rollback plan ready |
| Transactions | Data consistency, atomicity, isolation | Deep | atomicity tests, isolation tests, deadlock recovery | full transaction flow | verify ACID properties |
| External Integrations | Third-party dependencies, API changes, failure modes | Standard | integration tests, mock third-party responses | integration flow | vendor communication may be needed |
| Production Deployment | Live system impact, rollback complexity | Deep | staged deployment tests, canary tests, rollback procedure | full deployment flow | have incident response ready |
