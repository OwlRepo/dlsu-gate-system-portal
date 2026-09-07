import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Installs the `uuid-ossp` extension the later migrations depend on.
 *
 * `CreateReportsTable1710100000000` and others call `uuid_generate_v4()`, which
 * that extension provides — but nothing ever created it. Every existing
 * environment works only because somebody installed it by hand once, so a
 * brand-new database fails on boot with:
 *
 *   Migration "CreateReportsTable1710100000000" failed,
 *   error: function uuid_generate_v4() does not exist
 *
 * Deliberately timestamped 1700000000000 — earlier than every other migration —
 * because TypeORM runs pending migrations in timestamp order, so anything later
 * would run after the migration that needs it.
 *
 * On a database that already has the extension this is a no-op: PostgreSQL
 * evaluates IF NOT EXISTS before any privilege check, so it succeeds even for a
 * role that could not have created it.
 *
 * `down()` deliberately does nothing. Dropping the extension would break every
 * table whose default calls uuid_generate_v4(), and reverting one migration
 * should never be able to do that.
 */
export class EnableUuidOsspExtension1700000000000 implements MigrationInterface {
  name = 'EnableUuidOsspExtension1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      return;
    } catch (error) {
      // Creating an extension needs elevated rights, which a managed-Postgres
      // application role often lacks. If it is already installed we are fine
      // regardless; if it is not, fail with something an operator can act on
      // rather than the confusing "function does not exist" further down.
      const rows = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
         ) AS installed`,
      )) as { installed: boolean }[];

      if (rows?.[0]?.installed) return;

      throw new Error(
        'The "uuid-ossp" extension is missing and this database role cannot ' +
          'create it. A superuser must run, once, against this database:\n\n' +
          '    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n' +
          `Underlying error: ${(error as Error)?.message ?? String(error)}`,
      );
    }
  }

  public async down(): Promise<void> {
    // Intentionally empty — see the note above.
  }
}
