import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSeoFieldsToProducts1712300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('products', [
      new TableColumn({
        name: 'meta_title_en',
        type: 'varchar',
        length: '70',
        isNullable: true,
      }),
      new TableColumn({
        name: 'meta_title_ar',
        type: 'varchar',
        length: '70',
        isNullable: true,
      }),
      new TableColumn({
        name: 'meta_description_en',
        type: 'varchar',
        length: '160',
        isNullable: true,
      }),
      new TableColumn({
        name: 'meta_description_ar',
        type: 'varchar',
        length: '160',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of [
      'meta_title_en',
      'meta_title_ar',
      'meta_description_en',
      'meta_description_ar',
    ]) {
      await queryRunner.dropColumn('products', col);
    }
  }
}