import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveColumnLengthsAndTypes1711441092123 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update text columns
    await queryRunner.query(`
      UPDATE students 
      SET 
        "ID_Number" = COALESCE("ID_Number", ''),
        "Name" = COALESCE("Name", ''),
        "Lived_Name" = COALESCE("Lived_Name", ''),
        "Remarks" = COALESCE("Remarks", ''),
        "Photo" = COALESCE("Photo", ''),
        "Campus_Entry" = COALESCE("Campus_Entry", '');
    `);

    // Update integer column with proper casting
    await queryRunner.query(`
      UPDATE students 
      SET "Unique_ID" = COALESCE("Unique_ID"::integer, 0);
    `);

    // Then modify columns
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "ID_Number" TYPE text;`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Name" TYPE text;`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Lived_Name" TYPE text USING "Lived_Name"::text;`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Remarks" TYPE text;`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Photo" TYPE text;`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Campus_Entry" TYPE text;`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Unique_ID" TYPE integer USING "Unique_ID"::integer;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "ID_Number" TYPE varchar(32);`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Name" TYPE varchar(99);`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Lived_Name" TYPE int USING CASE WHEN "Lived_Name" ~ '^[0-9]+$' THEN "Lived_Name"::integer ELSE 0 END;`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Remarks" TYPE varchar(7);`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Photo" TYPE varchar(46);`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Campus_Entry" TYPE varchar(1);`,
    );
    await queryRunner.query(
      `ALTER TABLE students ALTER COLUMN "Unique_ID" TYPE int;`,
    );
  }
}
