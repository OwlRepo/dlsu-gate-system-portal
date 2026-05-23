import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupToStudents1750000000000 implements MigrationInterface {
  name = 'AddGroupToStudents1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
      ADD COLUMN "group" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
      DROP COLUMN "group"
    `);
  }
}
