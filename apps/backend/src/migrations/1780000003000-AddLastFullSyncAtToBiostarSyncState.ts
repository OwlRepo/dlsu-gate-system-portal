import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `last_full_sync_at` — when the BioStar pull last walked the WHOLE user list
 * instead of only what `last_modified` had moved past.
 *
 * Incremental listing is only as trustworthy as BioStar's own bookkeeping. A
 * profile photo uploaded through the BioStar UI is not guaranteed to bump the
 * user's `last_modified`, and once the cursor is past that user nothing ever
 * looks at him again — the photo simply never reaches PostgreSQL, with no
 * error anywhere to explain it.
 *
 * This column is what makes a full pass come round on its own schedule
 * (`BIOSTAR_FULL_SYNC_INTERVAL_HOURS`, default 24) rather than relying on a
 * human noticing. NULL means "never did one", so the first run after deploy is
 * a full pass, which is also what re-establishes the baseline.
 *
 * Additive only. The main sync path does not read it.
 */
export class AddLastFullSyncAtToBiostarSyncState1780000003000 implements MigrationInterface {
  name = 'AddLastFullSyncAtToBiostarSyncState1780000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "biostar_sync_state"
        ADD COLUMN IF NOT EXISTS "lastFullSyncAt" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "biostar_sync_state"
        DROP COLUMN IF EXISTS "lastFullSyncAt"
    `);
  }
}
