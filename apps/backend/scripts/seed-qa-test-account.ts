/**
 * seed-qa-test-account.ts
 *
 * DEV-ONLY QA TOOLING. Never imported by application code, never run in
 * production. Seeds one fixed super-admin account and one fixed employee
 * account into a real local Postgres so a human (or the gstack `/qa` skill)
 * can log into the admin dashboard (`/dashboard`) and the employee dashboard
 * (`/employee-dashboard`, TurnstileDashboard) during a manual QA pass,
 * without touching any real production/roster-synced account.
 *
 * Run (from the repo root):
 *   bun --cwd apps/backend scripts/seed-qa-test-account.ts
 * ...or equivalently, from inside apps/backend:
 *   cd apps/backend && bun scripts/seed-qa-test-account.ts
 *
 * NOTE on invocation: plain `bun apps/backend/scripts/seed-qa-test-account.ts`
 * run from the repo root does NOT work — the repo root has no tsconfig.json,
 * so Bun's on-the-fly transpiler can't see apps/backend/tsconfig.json's
 * `emitDecoratorMetadata: true`, and TypeORM's `@Column()` decorators on
 * entities with an inferred (not explicit) type — e.g. `Admin#username` —
 * fail to resolve a column type at import time. Using `--cwd apps/backend`
 * (or literally being in that directory) makes Bun pick up the right
 * tsconfig and resolves it. This is a Bun/TypeORM interaction, not specific
 * to this script — the same failure would hit any script importing
 * `AppDataSource` the same way.
 *
 * Requires:
 *   - `QA_TEST_ACCOUNT_PASSWORD` set in the environment (root `.env`). Used
 *     as the password for BOTH seeded accounts. There is no hardcoded
 *     fallback password on purpose.
 *   - A reachable local Postgres matching the DB_* / DATABASE_URL values
 *     already used by `apps/backend/src/config/data-source.ts` (the same
 *     DataSource the `migration:*` scripts use).
 *
 * Idempotent: re-running this script finds the existing `qa-test-superadmin`
 * / `qa-test-employee` rows by username and updates their password hash in
 * place instead of inserting duplicates.
 *
 * Hashing: uses bcryptjs with 10 salt rounds, matching the convention used
 * throughout the backend (see `super-admin.service.ts`, `employee.service.ts`).
 */

// Must be imported before any TypeORM-decorated entity so decorator
// metadata (used by @Column() to infer column types) is registered. Bun's
// on-the-fly transpiler needs this explicit import even though the compiled
// Nest app (built with tsc) does not.
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../src/config/data-source';
import { SuperAdmin } from '../src/super-admin/entities/super-admin.entity';
import { Employee } from '../src/employee/entities/employee.entity';

const QA_SUPER_ADMIN_USERNAME = 'qa-test-superadmin';
const QA_SUPER_ADMIN_EMAIL = 'qa-test-superadmin@example.invalid';
const QA_SUPER_ADMIN_ID = 'SAD-QATEST01';

const QA_EMPLOYEE_USERNAME = 'qa-test-employee';
const QA_EMPLOYEE_EMAIL = 'qa-test-employee@example.invalid';
const QA_EMPLOYEE_ID = 'EMP-QATEST01';
const QA_EMPLOYEE_DEVICE_ID = 'QA-TEST-DEVICE-001';

const SALT_ROUNDS = 10;

function guardNonProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[seed-qa-test-account] Refusing to run: NODE_ENV=production. ' +
        'This script seeds fake QA fixture accounts and must never touch a production database.',
    );
    process.exit(1);
  }
}

function requirePassword(): string {
  const password = process.env.QA_TEST_ACCOUNT_PASSWORD;
  if (!password) {
    throw new Error(
      '[seed-qa-test-account] QA_TEST_ACCOUNT_PASSWORD is not set. ' +
        'Set it in your local .env before running this script. There is no default password.',
    );
  }
  return password;
}

function printTargetDatabase(): void {
  const options = AppDataSource.options as {
    host?: string;
    port?: number;
    database?: string;
  };
  console.log('[seed-qa-test-account] About to connect to:');
  console.log(`  host:     ${options.host}`);
  console.log(`  port:     ${options.port}`);
  console.log(`  database: ${options.database}`);
}

async function upsertSuperAdmin(hashedPassword: string): Promise<{
  super_admin_id: string;
  username: string;
  created: boolean;
}> {
  const repo = AppDataSource.getRepository(SuperAdmin);
  const existing = await repo.findOne({
    where: { username: QA_SUPER_ADMIN_USERNAME },
  });

  if (existing) {
    existing.password = hashedPassword;
    existing.updated_at = new Date();
    existing.is_active = true;
    await repo.save(existing);
    return {
      super_admin_id: existing.super_admin_id,
      username: existing.username,
      created: false,
    };
  }

  const created = repo.create({
    super_admin_id: QA_SUPER_ADMIN_ID,
    username: QA_SUPER_ADMIN_USERNAME,
    email: QA_SUPER_ADMIN_EMAIL,
    password: hashedPassword,
    first_name: 'QA',
    last_name: 'SuperAdmin',
    role: 'super-admin',
    created_at: new Date(),
    updated_at: new Date(),
    is_active: true,
    date_activated: new Date(),
    date_deactivated: null,
  });
  const saved = await repo.save(created);
  return {
    super_admin_id: saved.super_admin_id,
    username: saved.username,
    created: true,
  };
}

async function upsertEmployee(hashedPassword: string): Promise<{
  employee_id: string;
  username: string;
  device_id: string[];
  created: boolean;
}> {
  const repo = AppDataSource.getRepository(Employee);
  const existing = await repo.findOne({
    where: { username: QA_EMPLOYEE_USERNAME },
  });

  if (existing) {
    existing.password = hashedPassword;
    existing.is_active = true;
    if (!existing.device_id || existing.device_id.length === 0) {
      existing.device_id = [QA_EMPLOYEE_DEVICE_ID];
    }
    await repo.save(existing);
    return {
      employee_id: existing.employee_id,
      username: existing.username,
      device_id: existing.device_id,
      created: false,
    };
  }

  const created = repo.create({
    username: QA_EMPLOYEE_USERNAME,
    password: hashedPassword,
    employee_id: QA_EMPLOYEE_ID,
    first_name: 'QA',
    last_name: 'Employee',
    is_active: true,
    date_created: new Date().toISOString(),
    date_activated: new Date().toISOString(),
    date_deactivated: null,
    device_id: [QA_EMPLOYEE_DEVICE_ID],
    email: QA_EMPLOYEE_EMAIL,
  });
  const saved = await repo.save(created);
  return {
    employee_id: saved.employee_id,
    username: saved.username,
    device_id: saved.device_id,
    created: true,
  };
}

async function main(): Promise<void> {
  // Hard guard must run before any DB connection attempt.
  guardNonProduction();

  printTargetDatabase();

  // Fail fast on a missing password before opening a DB connection.
  const password = requirePassword();

  await AppDataSource.initialize();

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const superAdminResult = await upsertSuperAdmin(hashedPassword);
    const employeeResult = await upsertEmployee(hashedPassword);

    console.log('');
    console.log('[seed-qa-test-account] Done.');
    console.log(
      `  super-admin: username=${superAdminResult.username} super_admin_id=${superAdminResult.super_admin_id} (${superAdminResult.created ? 'created' : 'already existed, password refreshed'})`,
    );
    console.log(
      `  employee:    username=${employeeResult.username} employee_id=${employeeResult.employee_id} device_id=${JSON.stringify(employeeResult.device_id)} (${employeeResult.created ? 'created' : 'already existed, password refreshed'})`,
    );
    console.log(
      '  password: (not printed) — value of QA_TEST_ACCOUNT_PASSWORD in your local .env',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('[seed-qa-test-account] Failed:', error.message || error);
  process.exit(1);
});
