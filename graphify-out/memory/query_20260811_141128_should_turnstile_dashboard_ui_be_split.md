---
type: "bfs"
date: "2026-08-11T14:11:28.107713+00:00"
question: "Should Turnstile Dashboard UI be split?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Dashboard", "TurnstileDashboard", "EntriesLog", "TurnstileGrid"]
---

# Q: Should Turnstile Dashboard UI be split?

## Answer

Expansion: turnstile, dashboard, module. Yes. The 68-node community has 106 boundary edges and two dashboard roots of 701 and 767 lines. Extract shared socket lifecycle, event reducer, API adapter, and report retry queue; retain dashboard and table components as presentation layers.

## Outcome

- Signal: useful

## Source Nodes

- Dashboard
- TurnstileDashboard
- EntriesLog
- TurnstileGrid