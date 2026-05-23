import { MigrationInterface, QueryRunner } from 'typeorm';

export class RunAllMigrations1744090868338 implements MigrationInterface {
  name = 'RunAllMigrations1744090868338';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create initial tables
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create admin table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin" (
        "id" SERIAL PRIMARY KEY,
        "username" VARCHAR(255) UNIQUE NOT NULL,
        "email" VARCHAR(255) UNIQUE NOT NULL,
        "password" VARCHAR(255) NOT NULL,
        "role" VARCHAR(255) NOT NULL,
        "admin_id" VARCHAR(255) NOT NULL,
        "first_name" VARCHAR(255) DEFAULT 'Unknown',
        "last_name" VARCHAR(255) DEFAULT 'Admin',
        "is_active" BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "is_activated" BOOLEAN DEFAULT false,
        "activation_token" VARCHAR(255),
        "activation_token_expires" TIMESTAMP
      )
    `);

    // Create super-admin table with timestamps and trigger
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "super-admin" (
        "id" SERIAL PRIMARY KEY,
        "super_admin_id" VARCHAR(255) UNIQUE NOT NULL,
        "username" VARCHAR(255) UNIQUE NOT NULL,
        "email" VARCHAR(255) UNIQUE NOT NULL,
        "password" VARCHAR(255) NOT NULL,
        "first_name" VARCHAR(255) DEFAULT 'Unknown',
        "last_name" VARCHAR(255) DEFAULT 'User',
        "role" VARCHAR(255) NOT NULL,
        "is_active" BOOLEAN DEFAULT true,
        "date_activated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "date_deactivated" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger function for super-admin updated_at
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_update_super_admin_updated_at ON "super-admin";
      DROP FUNCTION IF EXISTS update_super_admin_updated_at();
      
      CREATE OR REPLACE FUNCTION update_super_admin_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for super-admin
    await queryRunner.query(`
      CREATE TRIGGER trigger_update_super_admin_updated_at
      BEFORE UPDATE ON "super-admin"
      FOR EACH ROW
      EXECUTE FUNCTION update_super_admin_updated_at();
    `);

    // Create employee table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "username" VARCHAR(255) UNIQUE NOT NULL,
        "password" VARCHAR(255) NOT NULL,
        "employee_id" VARCHAR(255) NOT NULL,
        "first_name" VARCHAR(255) NOT NULL,
        "last_name" VARCHAR(255) NOT NULL,
        "is_active" BOOLEAN NOT NULL,
        "date_created" VARCHAR(255) NOT NULL,
        "date_activated" VARCHAR(255) NOT NULL,
        "date_deactivated" VARCHAR(255),
        "device_id" JSON DEFAULT '[]',
        "email" VARCHAR(255) UNIQUE NOT NULL
      )
    `);

    // Create students table with proper column types
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "students" (
        "id" SERIAL PRIMARY KEY,
        "ID_Number" TEXT,
        "Name" TEXT,
        "Lived_Name" TEXT,
        "Remarks" TEXT,
        "Photo" TEXT,
        "Campus_Entry" TEXT,
        "Unique_ID" BIGINT,
        "isArchived" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create reports table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "datetime" TIMESTAMP NOT NULL,
        "type" VARCHAR(255) NOT NULL,
        "user_id" VARCHAR(255) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "remarks" TEXT,
        "status" VARCHAR(255) NOT NULL,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sync_schedule table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_schedule" (
        "id" SERIAL PRIMARY KEY,
        "scheduleNumber" INTEGER NOT NULL,
        "time" VARCHAR(255) NOT NULL,
        "cronExpression" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "lastSyncTime" TIMESTAMP
      )
    `);

    // Create sync_queue table with updatedAt
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sync_queue" (
        "id" SERIAL PRIMARY KEY,
        "status" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create token_blacklist table with blacklistedAt
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_blacklist" (
        "id" SERIAL PRIMARY KEY,
        "token" TEXT NOT NULL,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "blacklistedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_queue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_schedule"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "students"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee"`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_update_super_admin_updated_at ON "super-admin"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS update_super_admin_updated_at()`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "super-admin"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_blacklist"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
