import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAllowAiInferenceToAttributes1712300000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'attributes',
      new TableColumn({
        name: 'allow_ai_inference',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.query(
      'UPDATE attributes SET allow_ai_inference = false',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('attributes', 'allow_ai_inference');
  }
}