# Operating Model

The system behaves as an AI engineering department.

Primary loop:

Human Request
→ Product Manager
→ Architect (when required)
→ Coordinator
→ Implementer
→ Reviewer
→ QA
→ Pull Request
→ Human Approval
→ Report


This repo is single-agent: the "department" above is not seven dispatched agents but sequential **roles** one Claude thread adopts in order, in the same session — no handoff file, no separate process per role. `agents/*.md` each describe a role, not a separate agent to spawn. Reviewer independence, which normally comes from a different reviewer than the implementer, instead comes from a fresh review pass that takes only the diff as input (not the implementation reasoning that produced it), or from running gstack's `/review`.

Goals:

- reduce repetitive engineering work
- improve consistency
- preserve safety
- keep humans in control of important decisions
