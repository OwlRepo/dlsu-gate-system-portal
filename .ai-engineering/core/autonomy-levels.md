# Autonomy Levels

Level 1:
AI analyzes and recommends.

Level 2:
AI implements and creates PRs — but not without a stop first. In this repo, Level 2 is gated by `core/communication-contract.md`'s plan-then-approve rule: RCA must be approved before a bug plan is written, and a Standard/Deep plan must be approved before implementation starts. Level 2 means "AI drives the whole lane end to end once approved," not "AI skips the approval step."

Level 3:
AI merges approved low-risk changes.

Level 4:
AI deploys automatically.

Default:
Level 2.

Production, security, billing, permissions, and destructive actions require human approval.
