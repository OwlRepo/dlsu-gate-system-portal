import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two columns that let the Dasma sync stop shouting at BioStar.
 *
 * `biostar_row_hash` — a sha256 of the CSV row we last successfully sent for
 * this student. Every run rebuilds each row and compares; only rows whose
 * content actually differs are exported. Until now the CSV carried the entire
 * non-archived roster on every run, and `import_option: 2` (Overwrite) meant
 * BioStar marked every one of those users modified. BioStar's Automatic User
 * Synchronization then re-transferred all of them to every connected device —
 * the mass re-enrollment DLSU reported.
 *
 * NULL means "never successfully exported", so the first run after deploy
 * exports everyone once and establishes the baseline. That is intended; it is
 * the SECOND run that should be near-silent.
 *
 * `remarks_checked_at` — when we last confirmed this student's remark against
 * BioStar. A remark deleted before the clearing fix shipped can never be
 * detected as a removal: Postgres is already blank, so the transition cannot
 * recur and nothing revisits those rows. This column drives a bounded sweep
 * that works through the roster a batch per run and then keeps itself current.
 * NULL means "never checked", which is exactly what feeds the sweep.
 *
 * Both nullable with no default and no backfill — NULL is a meaningful state
 * for each, unlike `remarks_clear_pending` in 1780000001000 where every
 * existing row genuinely had nothing pending.
 *
 * Additive only. The main sync path reads neither.
 */
export class AddBiostarRowHashAndRemarksCheckedAt1780000002000 implements MigrationInterface {
  name = 'AddBiostarRowHashAndRemarksCheckedAt1780000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN IF NOT EXISTS "biostar_row_hash" VARCHAR(64) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN IF NOT EXISTS "remarks_checked_at" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
        DROP COLUMN IF EXISTS "remarks_checked_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "students"
        DROP COLUMN IF EXISTS "biostar_row_hash"
    `);
  }
}
