import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecreateSyncQueue1744090868337 implements MigrationInterface {
  name = 'RecreateSyncQueue1744090868337';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_queue" (
        "id" SERIAL PRIMARY KEY,
        "status" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_queue"`);
  }
}
