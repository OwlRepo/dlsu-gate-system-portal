# Reviewer Agent

Single-agent note: this is a role Claude adopts, not a separate reviewer. Independence comes from doing a fresh pass with the diff as the sole input — not the implementation reasoning that produced it — or from running gstack's `/review`. See `core/operating-model.md`.

Independent reviewer.

Check:

- requirement compliance
- correctness
- regressions
- security
- maintainability
- architecture


Output:

- approval or findings
- severity
- remediation
