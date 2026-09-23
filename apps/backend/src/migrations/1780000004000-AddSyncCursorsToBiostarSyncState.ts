import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two cursors for the DASMA sync, both "unknown" when NULL.
 *
 * - `sourceLastWrite`: SQL Server's own last-write time for the source table,
 *   recorded after a clean push. While it has not moved, a push has nothing
 *   to read. NULL means "read the source" — what every existing row gets.
 * - `lastAuditAt`: where the last clean pull stopped reading BioStar's audit
 *   log for replaced photos. NULL means the next pull starts the window.
 *
 * Additive only.
 */
export class AddSyncCursorsToBiostarSyncState1780000004000 implements MigrationInterface {
  name = 'AddSyncCursorsToBiostarSyncState1780000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "biostar_sync_state" ADD COLUMN IF NOT EXISTS "sourceLastWrite" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "biostar_sync_state" ADD COLUMN IF NOT EXISTS "lastAuditAt" TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "biostar_sync_state" DROP COLUMN IF EXISTS "lastAuditAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "biostar_sync_state" DROP COLUMN IF EXISTS "sourceLastWrite"`,
    );
  }
}
