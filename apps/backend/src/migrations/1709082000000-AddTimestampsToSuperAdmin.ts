import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimestampsToSuperAdmin1709082000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create table if it doesn't exist with all required columns
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "super-admin" (
        "id" SERIAL PRIMARY KEY,
        "super_admin_id" VARCHAR UNIQUE,
        "username" VARCHAR UNIQUE,
        "email" VARCHAR UNIQUE,
        "password" VARCHAR,
        "first_name" VARCHAR DEFAULT 'Unknown',
        "last_name" VARCHAR DEFAULT 'User',
        "role" VARCHAR,
        "is_active" BOOLEAN DEFAULT true,
        "date_activated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "date_deactivated" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger to automatically update updated_at
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_super_admin_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_update_super_admin_updated_at
      BEFORE UPDATE ON "super-admin"
      FOR EACH ROW
      EXECUTE FUNCTION update_super_admin_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove trigger and function
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_update_super_admin_updated_at ON "super-admin";
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_super_admin_updated_at();
    `);

    // Drop the table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "super-admin"
    `);
  }
}
