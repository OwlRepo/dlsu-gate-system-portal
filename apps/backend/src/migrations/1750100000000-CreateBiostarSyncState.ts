import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBiostarSyncState1750100000000 implements MigrationInterface {
  name = 'CreateBiostarSyncState1750100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "biostar_sync_state" (
        "id" SERIAL PRIMARY KEY,
        "schemaKey" VARCHAR(255) UNIQUE NOT NULL DEFAULT 'dasma',
        "lastModifiedCursor" VARCHAR(255),
        "lastProcessedOffset" INTEGER,
        "lastProcessedUserId" VARCHAR(255),
        "lastRunAt" TIMESTAMP,
        "lastSuccessAt" TIMESTAMP,
        "lastError" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "biostar_sync_state"`);
  }
}
