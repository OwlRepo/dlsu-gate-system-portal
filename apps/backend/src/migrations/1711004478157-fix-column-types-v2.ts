import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixColumnTypesV21711004478157 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, alter the isArchived column to varchar with enough length
    await queryRunner.query(`
      ALTER TABLE students 
      ALTER COLUMN "isArchived" TYPE varchar(50)
    `);

    // Then convert 'Y'/'N' values to proper boolean values
    await queryRunner.query(`
      UPDATE students 
      SET "isArchived" = CASE 
        WHEN "isArchived" = 'Y' THEN 'true'
        ELSE 'false'
      END
    `);

    // Now alter isArchived to boolean
    await queryRunner.query(`
      ALTER TABLE students 
      ALTER COLUMN "isArchived" TYPE boolean USING "isArchived"::boolean
    `);

    // Finally, alter the Unique_ID column to varchar
    await queryRunner.query(`
      ALTER TABLE students 
      ALTER COLUMN "Unique_ID" TYPE varchar(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // First convert isArchived back to varchar with enough length
    await queryRunner.query(`
      ALTER TABLE students 
      ALTER COLUMN "isArchived" TYPE varchar(50)
    `);

    // Convert boolean values back to 'Y'/'N'
    await queryRunner.query(`
      UPDATE students 
      SET "isArchived" = CASE 
        WHEN "isArchived"::boolean = true THEN 'Y'
        ELSE 'N'
      END
    `);

    // Finally convert isArchived back to varchar(1)
    await queryRunner.query(`
      ALTER TABLE students 
      ALTER COLUMN "isArchived" TYPE varchar(1)
    `);

    // Revert the Unique_ID column
    await queryRunner.query(`
      ALTER TABLE students 
      ALTER COLUMN "Unique_ID" TYPE integer
    `);
  }
}
