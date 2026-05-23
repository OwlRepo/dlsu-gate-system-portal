# Verification Strategy

Run strongest available safe checks in order:
1. `typecheck`
2. `lint`
3. related tests
4. full test suite (if reasonable)
5. `build`

## If command is missing
Document as: `Not detected.`

## If command fails
Report:
- command
- failure summary
- likely cause
- whether related to your change
