import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateProductSlugRedirects1712300000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'product_slug_redirects',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'old_slug', type: 'varchar', isUnique: true },
          { name: 'new_slug', type: 'varchar' },
          { name: 'product_id', type: 'int' },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('product_slug_redirects');
  }
}