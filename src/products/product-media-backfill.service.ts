import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ProductMediaBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductMediaBackfillService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const [tableRow] = await this.dataSource.query(
        `SELECT to_regclass('public.product_media') AS table_name`,
      );

      if (!tableRow?.table_name) {
        return;
      }

      const insertedRows = await this.dataSource.query(`
        INSERT INTO product_media (
          product_id,
          media_id,
          sort_order,
          is_primary,
          created_at,
          updated_at
        )
        SELECT
          media.product_id,
          media.id,
          COALESCE(media.sort_order, 0),
          COALESCE(media.is_primary, false),
          COALESCE(media.created_at, NOW()),
          COALESCE(media.updated_at, NOW())
        FROM media
        WHERE media.product_id IS NOT NULL
        ON CONFLICT (product_id, media_id) DO NOTHING
        RETURNING id
      `);

      if (insertedRows.length > 0) {
        this.logger.log(
          `Backfilled ${insertedRows.length} product-media links from legacy media rows`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to backfill legacy product media links: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}