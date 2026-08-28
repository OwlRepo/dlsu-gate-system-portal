import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `students` a memory of when each person was activated.
 *
 * Without these columns the Dasma sync had nowhere to record an activation
 * date, so the BioStar CSV re-derived the expiry window from `dayjs()` on every
 * run and every enrolled person's expiry moved forward one day, every day.
 *
 * All three columns are nullable with NO DEFAULT on purpose. A null
 * `date_activated` means "never yet seen active", and the sync backfills it on
 * the first run after deploy. A `DEFAULT CURRENT_TIMESTAMP` — as the older
 * AddActivationColumnsToUsers migrations use for `admin`/`super_admin` — would
 * instead stamp every existing row with the migration date and destroy exactly
 * the distinction this change exists to create.
 *
 * Additive only: no column is altered or dropped, and the main sync path
 * neither reads nor writes these, so its behaviour is unchanged.
 */
export class AddActivationColumnsToStudents1780000000000 implements MigrationInterface {
  name = 'AddActivationColumnsToStudents1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN IF NOT EXISTS "date_activated" TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "date_deactivated" TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "expiry_datetime" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        DROP COLUMN IF EXISTS "date_activated",
        DROP COLUMN IF EXISTS "date_deactivated",
        DROP COLUMN IF EXISTS "expiry_datetime"
    `);
  }
}
