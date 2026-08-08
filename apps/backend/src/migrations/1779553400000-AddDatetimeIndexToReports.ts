import { MigrationInterface, QueryRunner } from 'typeorm';

// Purely additive: adds one index, no column/type changes, no data touched.
// Plain CREATE INDEX (not CONCURRENTLY) on purpose — this repo runs all
// pending migrations inside a transaction on boot (AppDataSource has
// migrationsRun: true with no migrationsTransactionMode override, so
// TypeORM defaults to wrapping them together), and Postgres refuses
// CREATE INDEX CONCURRENTLY inside a transaction block. A plain CREATE
// INDEX takes a brief write-blocking lock while it builds, but is
// guaranteed to actually run under this migration setup instead of
// failing the boot outright.
export class AddDatetimeIndexToReports1779553400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reports_datetime" ON "reports" ("datetime")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reports_datetime"`);
  }
}
