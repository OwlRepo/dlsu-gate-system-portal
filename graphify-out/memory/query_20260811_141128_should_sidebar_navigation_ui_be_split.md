---
type: "bfs"
date: "2026-08-11T14:11:28.079020+00:00"
question: "Should Sidebar Navigation UI be split?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Sidebar", "Module", "useSidebar", "SidebarProvider", "AppSidebar"]
---

# Q: Should Sidebar Navigation UI be split?

## Answer

Expansion: sidebar, navigation, module. Yes. The 81-node community spans 14 files; sidebar.tsx is 763 lines and combines context/provider, shell/layout, groups, and menu variants. Extract sidebar-context, sidebar-shell, and sidebar-menu while preserving barrel exports and keeping AppSidebar as the product adapter.

## Outcome

- Signal: useful

## Source Nodes

- Sidebar
- Module
- useSidebar
- SidebarProvider
- AppSidebar