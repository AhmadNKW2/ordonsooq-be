import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePrimaryCategoryFromVendorCategories1712300000009
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "vendor_category_categories" ("vendor_category_id", "category_id")
      SELECT vc."id", vc."category_id"
      FROM "vendor_categories" vc
      LEFT JOIN "vendor_category_categories" vcc
        ON vcc."vendor_category_id" = vc."id"
       AND vcc."category_id" = vc."category_id"
      WHERE vc."category_id" IS NOT NULL
        AND vcc."vendor_category_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_categories"
      DROP CONSTRAINT IF EXISTS "fk_vendor_categories_category_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vendor_categories_category_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_categories"
      DROP COLUMN IF EXISTS "category_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendor_categories"
      ADD COLUMN IF NOT EXISTS "category_id" integer
    `);

    await queryRunner.query(`
      UPDATE "vendor_categories" vc
      SET "category_id" = mapped."category_id"
      FROM (
        SELECT "vendor_category_id", MIN("category_id") AS "category_id"
        FROM "vendor_category_categories"
        GROUP BY "vendor_category_id"
      ) AS mapped
      WHERE mapped."vendor_category_id" = vc."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_categories"
      ALTER COLUMN "category_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "vendor_categories"
      ADD CONSTRAINT "fk_vendor_categories_category_id"
      FOREIGN KEY ("category_id") REFERENCES "categories"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_categories_category_id"
      ON "vendor_categories" ("category_id")
    `);
  }
}