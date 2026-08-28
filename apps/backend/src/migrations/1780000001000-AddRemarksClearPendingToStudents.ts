import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remembers that a remark still needs clearing in BioStar.
 *
 * Clearing a removed remark needs a per-user PUT, because BioStar's csv_import
 * ignores a blank cell rather than applying it. If that PUT fails, the sync had
 * no way to retry: the trigger for it is `existing.Remarks` still holding the
 * old value, and PostgreSQL was cleared in the same run. The transition never
 * recurs, so PostgreSQL said "no remark" while the gate screen kept showing
 * one — permanently. That is the drift `core/safety.md` invariant 2 forbids.
 *
 * NOT NULL DEFAULT false, deliberately unlike the activation columns added in
 * 1780000000000: there "unknown" is a real state worth distinguishing, whereas
 * every existing row here genuinely has nothing pending.
 *
 * Additive only; the main sync path neither reads nor writes this.
 */
export class AddRemarksClearPendingToStudents1780000001000 implements MigrationInterface {
  name = 'AddRemarksClearPendingToStudents1780000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN IF NOT EXISTS "remarks_clear_pending" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        DROP COLUMN IF EXISTS "remarks_clear_pending"
    `);
  }
}
