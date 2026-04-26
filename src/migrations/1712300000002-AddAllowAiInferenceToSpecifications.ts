import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAllowAiInferenceToSpecifications1712300000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'specifications',
      new TableColumn({
        name: 'allow_ai_inference',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.query(
      'UPDATE specifications SET allow_ai_inference = false',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('specifications', 'allow_ai_inference');
  }
}