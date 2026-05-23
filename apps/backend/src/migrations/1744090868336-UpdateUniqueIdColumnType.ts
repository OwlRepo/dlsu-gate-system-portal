import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateUniqueIdColumnType1744090868336 implements MigrationInterface {
  name = 'UpdateUniqueIdColumnType1744090868336';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, drop any existing default value constraint
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "Unique_ID" DROP DEFAULT`,
    );

    // Change column type to BIGINT
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "Unique_ID" TYPE BIGINT USING ("Unique_ID"::bigint)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to integer (note: this might fail if values are too large)
    await queryRunner.query(
      `ALTER TABLE "students" ALTER COLUMN "Unique_ID" TYPE INTEGER USING ("Unique_ID"::integer)`,
    );
  }
}
