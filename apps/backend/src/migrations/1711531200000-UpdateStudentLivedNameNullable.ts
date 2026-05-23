import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateStudentLivedNameNullable1711531200000 implements MigrationInterface {
  name = 'UpdateStudentLivedNameNullable1711531200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, drop the not null constraint if it exists
    await queryRunner.query(`
            ALTER TABLE "students" 
            ALTER COLUMN "Lived_Name" DROP NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // In case we need to rollback, we'll add the not null constraint back
    await queryRunner.query(`
            ALTER TABLE "students" 
            ALTER COLUMN "Lived_Name" SET NOT NULL
        `);
  }
}
