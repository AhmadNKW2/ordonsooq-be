import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVendorCategories1712300000007
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vendor_categories" (
        "id" SERIAL NOT NULL,
        "title" character varying(255) NOT NULL,
        "url" text NOT NULL,
        "vendor_id" integer NOT NULL,
        "category_id" integer NOT NULL,
        "parent_id" integer,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_vendor_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_vendor_categories_vendor_url" UNIQUE ("vendor_id", "url"),
        CONSTRAINT "fk_vendor_categories_vendor_id"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_vendor_categories_category_id"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_vendor_categories_parent_id"
          FOREIGN KEY ("parent_id") REFERENCES "vendor_categories"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_categories_vendor_id"
      ON "vendor_categories" ("vendor_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_categories_parent_id"
      ON "vendor_categories" ("parent_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_categories_category_id"
      ON "vendor_categories" ("category_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_categories_sort_order"
      ON "vendor_categories" ("sort_order")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vendor_category_categories" (
        "vendor_category_id" integer NOT NULL,
        "category_id" integer NOT NULL,
        CONSTRAINT "pk_vendor_category_categories"
          PRIMARY KEY ("vendor_category_id", "category_id"),
        CONSTRAINT "fk_vendor_category_categories_vendor_category_id"
          FOREIGN KEY ("vendor_category_id") REFERENCES "vendor_categories"("id")
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "fk_vendor_category_categories_category_id"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_category_categories_vendor_category_id"
      ON "vendor_category_categories" ("vendor_category_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vendor_category_categories_category_id"
      ON "vendor_category_categories" ("category_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vendor_category_categories_category_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vendor_category_categories_vendor_category_id"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "vendor_category_categories"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vendor_categories_sort_order"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vendor_categories_category_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vendor_categories_parent_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vendor_categories_vendor_id"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "vendor_categories"
    `);
  }
}