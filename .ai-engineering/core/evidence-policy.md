# Evidence Policy

No agent can claim completion without evidence.

Required examples:

Implementation:
- files changed
- commits
- tests

Review:
- findings
- recommendation

QA:
- scenarios tested
- results

Release:
- artifact or deployment proof

Evidence must describe what was actually observed — not what should have happened, not what was intended. Report failures the same way: command run, failure summary, likely cause, and whether it's related to the change.

## Never assume

- Never reference a file without verifying it exists.
- Never assume API shape, package availability, env keys, routes, or components — inspect first when uncertain.
- Never edit from a filename guess alone.

## Verification command order

Run in this order, stopping to report (not silently skipping) any command that's unavailable:

1. typecheck
2. lint
3. related/targeted tests
4. full test suite (if reasonable)
5. build

If a command doesn't exist in this repo, say so explicitly (`Not detected.`) rather than assuming it and moving on. See `knowledge/testing-strategy.md` for the actual verified commands.
