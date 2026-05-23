import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateStudentNullableColumns1711442847914 implements MigrationInterface {
  name = 'UpdateStudentNullableColumns1711442847914';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Handle both columns in a single PL/pgSQL block for atomicity
    await queryRunner.query(`
            DO $$ 
            BEGIN 
                -- Handle Lived_Name column
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'students' AND column_name = 'Lived_Name'
                ) THEN
                    -- Update any existing NULL values to empty string
                    UPDATE "students" SET "Lived_Name" = '' WHERE "Lived_Name" IS NULL;
                    -- Drop NOT NULL constraint
                    ALTER TABLE "students" ALTER COLUMN "Lived_Name" DROP NOT NULL;
                    -- Ensure correct type
                    ALTER TABLE "students" ALTER COLUMN "Lived_Name" TYPE character varying;
                ELSE
                    -- Create the column if it doesn't exist
                    ALTER TABLE "students" ADD COLUMN "Lived_Name" character varying;
                END IF;

                -- Handle Unique_ID column
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'students' AND column_name = 'Unique_ID'
                ) THEN
                    -- Drop NOT NULL constraint if it exists
                    ALTER TABLE "students" ALTER COLUMN "Unique_ID" DROP NOT NULL;
                    -- Set default value for existing NULL values
                    UPDATE "students" SET "Unique_ID" = 0 WHERE "Unique_ID" IS NULL;
                ELSE
                    -- Create the column if it doesn't exist
                    ALTER TABLE "students" ADD COLUMN "Unique_ID" integer;
                END IF;

                -- Ensure all columns have appropriate types and constraints
                ALTER TABLE "students" ALTER COLUMN "ID_Number" TYPE character varying;
                ALTER TABLE "students" ALTER COLUMN "Name" TYPE character varying;
                ALTER TABLE "students" ALTER COLUMN "Remarks" TYPE character varying;
                ALTER TABLE "students" ALTER COLUMN "Photo" TYPE character varying;
                ALTER TABLE "students" ALTER COLUMN "Campus_Entry" TYPE character varying;
                
                -- Make all these columns nullable as well
                ALTER TABLE "students" ALTER COLUMN "ID_Number" DROP NOT NULL;
                ALTER TABLE "students" ALTER COLUMN "Name" DROP NOT NULL;
                ALTER TABLE "students" ALTER COLUMN "Remarks" DROP NOT NULL;
                ALTER TABLE "students" ALTER COLUMN "Photo" DROP NOT NULL;
                ALTER TABLE "students" ALTER COLUMN "Campus_Entry" DROP NOT NULL;
            EXCEPTION WHEN OTHERS THEN
                -- Log the error details
                RAISE NOTICE 'Error occurred: %', SQLERRM;
                RAISE;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // In rollback, we'll ensure no nulls exist but keep columns nullable
    await queryRunner.query(`
            UPDATE "students" SET "Lived_Name" = '' WHERE "Lived_Name" IS NULL;
            UPDATE "students" SET "Unique_ID" = 0 WHERE "Unique_ID" IS NULL;
            UPDATE "students" SET "ID_Number" = '' WHERE "ID_Number" IS NULL;
            UPDATE "students" SET "Name" = '' WHERE "Name" IS NULL;
            UPDATE "students" SET "Remarks" = '' WHERE "Remarks" IS NULL;
            UPDATE "students" SET "Photo" = '' WHERE "Photo" IS NULL;
            UPDATE "students" SET "Campus_Entry" = '' WHERE "Campus_Entry" IS NULL;
        `);
  }
}
