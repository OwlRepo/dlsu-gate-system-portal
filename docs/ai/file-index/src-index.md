# Source Index

| File path | Purpose | Main exports | Dependencies | Consumers | Usage patterns | Risk |
|---|---|---|---|---|---|---|
| `apps/backend/src/main.ts` | Backend bootstrap and server init | `bootstrap` (invoked) | Nest core, app module | backend runtime | app startup + migrations | HIGH |
| `apps/backend/src/app.module.ts` | Backend DI root module | `AppModule` | Nest modules, config, TypeORM | `main.ts` | module composition | HIGH |
| `apps/portal-web/src/app/layout.tsx` | Frontend app shell | `RootLayout` | Next app router, global styles | all frontend routes | app layout | MEDIUM |
