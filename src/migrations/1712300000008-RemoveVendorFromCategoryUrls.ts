import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveVendorFromCategoryUrls1712300000008
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "category_urls" AS current_row
      USING "category_urls" AS duplicate_row
      WHERE current_row.id > duplicate_row.id
        AND current_row.category_id = duplicate_row.category_id
        AND current_row.url = duplicate_row.url
    `);

    await queryRunner.query(`
      ALTER TABLE "category_urls"
      DROP CONSTRAINT IF EXISTS "uq_category_urls_category_vendor_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "category_urls"
      DROP CONSTRAINT IF EXISTS "uq_category_urls_category_vendor"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_category_urls_vendor_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "category_urls"
      DROP COLUMN IF EXISTS "vendor_id" CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "category_urls"
      ADD CONSTRAINT "uq_category_urls_category_url"
      UNIQUE ("category_id", "url")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "category_urls"
      DROP CONSTRAINT IF EXISTS "uq_category_urls_category_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "category_urls"
      ADD COLUMN IF NOT EXISTS "vendor_id" integer
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_category_urls_vendor_id"
      ON "category_urls" ("vendor_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "category_urls"
      ADD CONSTRAINT "fk_category_urls_vendor_id"
      FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "category_urls"
      ADD CONSTRAINT "uq_category_urls_category_vendor_url"
      UNIQUE ("category_id", "vendor_id", "url")
    `);
  }
}