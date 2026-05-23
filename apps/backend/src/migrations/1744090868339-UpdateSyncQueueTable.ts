import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSyncQueueTable1744090868339 implements MigrationInterface {
  name = 'UpdateSyncQueueTable1744090868339';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First check if the table exists
    const tableExists = await queryRunner.hasTable('sync_queue');

    if (tableExists) {
      // If table exists, just add or modify columns as needed
      await queryRunner.query(`
        ALTER TABLE "sync_queue" 
        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      `);
    } else {
      // Create the enum type for sync status
      await queryRunner.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_queue_status_enum') THEN
            CREATE TYPE "sync_queue_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed');
          END IF;
        END $$;
      `);

      // Create the sync_queue table with proper structure
      await queryRunner.query(`
        CREATE TABLE "sync_queue" (
          "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          "status" "sync_queue_status_enum" NOT NULL DEFAULT 'pending',
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "completedAt" TIMESTAMP
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_queue"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sync_queue_status_enum"`);
  }
}
