import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivationColumnsToUsers1744008085000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to admin table
    await queryRunner.query(`
      ALTER TABLE "admin" 
      ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "date_activated" timestamp DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "date_deactivated" timestamp NULL
    `);

    // Add columns to super-admin table
    await queryRunner.query(`
      ALTER TABLE "super-admin" 
      ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "date_activated" timestamp DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "date_deactivated" timestamp NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns from admin table
    await queryRunner.query(`
      ALTER TABLE "admin" 
      DROP COLUMN IF EXISTS "is_active",
      DROP COLUMN IF EXISTS "date_activated",
      DROP COLUMN IF EXISTS "date_deactivated"
    `);

    // Remove columns from super-admin table
    await queryRunner.query(`
      ALTER TABLE "super-admin" 
      DROP COLUMN IF EXISTS "is_active",
      DROP COLUMN IF EXISTS "date_activated",
      DROP COLUMN IF EXISTS "date_deactivated"
    `);
  }
}
