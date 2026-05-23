# Verification Strategy

Preferred order:
1. typecheck
2. lint
3. related tests
4. full test suite if reasonable
5. build

## If command is unavailable
Document as `Not detected.`

## If command fails
Report:
- command
- failure summary
- likely cause
- whether failure is related to the change

## TDD Verification Requirement
For behavior-changing tasks, ensure the failing test existed before implementation and now passes after implementation.
