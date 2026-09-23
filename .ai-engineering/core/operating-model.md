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


The "department" runs as generated Claude Code personas (`../.claude/agents/`, sources in `../agents/src/`), dispatched by the main session per `../docs/ai/agent-orchestration.md` (decided 2026-09-23; it replaces the earlier single-agent rule). `agents/*.md` here are the role **contracts** those personas follow: `project-manager` covers Product Manager + Coordinator, `database-architect` covers Architect for schema work, `nestjs-backend-dev` / `nextjs-frontend-dev` are Implementers, `code-reviewer` / `security-auditor` are Reviewers, `test-engineer` / `accessibility-auditor` / `ui-ux-designer` are QA. A subagent cannot spawn another subagent, so the main session is always the orchestrator. Reviewer independence comes from a persona (or gstack `/review`) that takes only the diff as input, never the implementation reasoning.

Goals:

- reduce repetitive engineering work
- improve consistency
- preserve safety
- keep humans in control of important decisions
