# Dev Commands

| Capability | Command |
|---|---|
| install | `bun install` |
| dev (all) | `bun run dev` |
| dev (backend) | `bun run dev:backend` |
| dev (web) | `bun run dev:web` |
| build (all) | `bun run build` |
| build (backend) | `bun run build:backend` |
| build (web) | `bun run build:web` |
| lint | `bun run lint` |
| typecheck | `bun run check-types` |
| format | `bun run format` |
| test | `bun --cwd apps/backend run test` |
| test:watch | `bun --cwd apps/backend run test:watch` |
| e2e | `bun --cwd apps/backend run test:e2e` |
| db:migrate | `bun --cwd apps/backend run migration:run` |
| db:generate | `bun --cwd apps/backend run migration:generate` |
