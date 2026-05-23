import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSyncAndStudentTables1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS sync_schedule (
                id SERIAL PRIMARY KEY,
                "scheduleNumber" INTEGER UNIQUE NOT NULL,
                time VARCHAR(5) NOT NULL,
                "cronExpression" VARCHAR(100) NOT NULL,
                "lastSyncTime" TIMESTAMP,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                "ID_Number" VARCHAR(255) UNIQUE NOT NULL,
                "Name" VARCHAR(255),
                "Lived_Name" VARCHAR(255),
                "Remarks" TEXT,
                "Photo" TEXT,
                "Campus_Entry" VARCHAR(255),
                "Unique_ID" VARCHAR(255),
                "isArchived" BOOLEAN DEFAULT false,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE IF EXISTS students;
            DROP TABLE IF EXISTS sync_schedule;
        `);
  }
}
