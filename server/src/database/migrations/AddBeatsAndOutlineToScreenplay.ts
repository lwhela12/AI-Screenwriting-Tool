import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBeatsAndOutlineToScreenplay1700000000000 implements MigrationInterface {
    name = 'AddBeatsAndOutlineToScreenplay1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "screenplays" ADD "beats" json`);
        await queryRunner.query(`ALTER TABLE "screenplays" ADD "outline" json`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "screenplays" DROP COLUMN "outline"`);
        await queryRunner.query(`ALTER TABLE "screenplays" DROP COLUMN "beats"`);
    }
}