import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUpdatedAtToSyncQueue1709711000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First check if the table exists
    const tableExists = await queryRunner.hasTable('sync_queue');

    if (!tableExists) {
      // Create the basic table first if it doesn't exist
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "sync_queue" (
          "id" SERIAL PRIMARY KEY,
          "status" VARCHAR(255) NOT NULL DEFAULT 'pending',
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "completedAt" TIMESTAMP
        )
      `);
    }

    // Now safely add the updatedAt column
    await queryRunner.query(`
      ALTER TABLE "sync_queue" 
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('sync_queue');

    if (tableExists) {
      await queryRunner.query(
        `ALTER TABLE "sync_queue" DROP COLUMN IF EXISTS "updatedAt"`,
      );
    }
  }
}
