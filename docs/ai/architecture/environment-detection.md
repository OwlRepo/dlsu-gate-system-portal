# Environment Detection

| Area | Detected |
|---|---|
| Project type | Monorepo (fullstack) |
| Runtime | Node.js (`>=18` root engines) |
| Primary package manager | Bun (`packageManager: bun@1.2.22`) |
| Build system | Turborepo (`turbo.json`) |
| Frontend framework | Next.js 15 (`apps/portal-web`) |
| Backend framework | NestJS 11 (`apps/backend`) |
| Language | TypeScript |
| Tests | Jest (backend unit + e2e) |
| Linting | ESLint |
| Formatting | Prettier |
| Database | PostgreSQL + SQL Server source sync |
| ORM | TypeORM |
| Auth | JWT + role guards (backend) |
| Deployment target | Windows Server 2022 (NSSM service scripts) |
| CI/CD | Jenkinsfile detected in backend history; no root CI workflow detected |
| Env files | Root `.env` (authoritative), root `.env.example` |
