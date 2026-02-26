import { Injectable, Logger } from '@nestjs/common';
import { TypesenseService } from './typesense.service';

export interface IndexableProduct {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string;
  slug?: string;
  sku?: string;

  // ── Search text (bilingual) ───────────────────────────────────────────────
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;

  // ── Relational labels (for text search) ──────────────────────────────────
  brand: string;            // brand name_en
  category: string;         // primary category name_en
  subcategory?: string;
  category_names_en?: string[];
  category_names_ar?: string[];
  tags?: string[];

  // ── Relational IDs (for facet/filter) ────────────────────────────────────
  brand_id?: number;
  vendor_id?: number;       // same as seller_id but typed int for facet
  seller_id?: string;       // kept for compat (vendor_id as string)
  category_ids?: number[];

  // ── Pricing ───────────────────────────────────────────────────────────────
  price: number;            // representative price (lowest group)
  sale_price?: number;      // representative sale price
  price_min: number;        // min(sale_price ?? price) across all groups
  price_max: number;        // max(sale_price ?? price) across all groups

  // ── Availability ─────────────────────────────────────────────────────────
  stock_quantity: number;
  in_stock: boolean;        // true if any stock row has quantity > 0
  is_available: boolean;    // status=active && visible=true

  // ── Attributes (for multi-attr filtering) ─────────────────────────────────
  attr_pairs?: string[];    // e.g. ["color:Black","color:أسود","ram:16GB"]

  // ── Rating ───────────────────────────────────────────────────────────────
  rating?: number;
  rating_count?: number;

  // ── Media ────────────────────────────────────────────────────────────────
  images?: string[];

  // ── Sorting signals ──────────────────────────────────────────────────────
  created_at: number;
  popularity_score: number;
  sales_count?: number;
}

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(private readonly typesenseService: TypesenseService) {}

  /**
   * Index or update a single product document.
   * Uses upsert — safe to call on create and update.
   */
  async indexProduct(product: IndexableProduct): Promise<void> {
    try {
      await this.typesenseService
        .getClient()
        .collections(this.typesenseService.getCollectionName())
        .documents()
        .upsert(product);

      this.logger.log(`Indexed product ${product.id}`);
    } catch (error) {
      this.logger.error(`Failed to index product ${product.id}`, error);
      throw error;
    }
  }

  /**
   * Bulk index an array of products using Typesense's import action.
   * More efficient than indexing one by one for large datasets.
   */
  async bulkIndexProducts(products: IndexableProduct[]): Promise<void> {
    if (!products.length) return;

    try {
      const results = await this.typesenseService
        .getClient()
        .collections(this.typesenseService.getCollectionName())
        .documents()
        .import(products, { action: 'upsert' });

      const failed = results.filter((r) => !r.success);
      if (failed.length) {
        this.logger.warn(
          `${failed.length}/${products.length} products failed to index`,
        );
      } else {
        this.logger.log(
          `✅ Bulk indexed ${products.length} products successfully`,
        );
      }
    } catch (error) {
      this.logger.error('Bulk indexing failed', error);
      throw error;
    }
  }

  /**
   * Remove a product from the search index.
   * Call this when a product is deleted or permanently disabled.
   */
  async deleteProduct(productId: string): Promise<void> {
    try {
      await this.typesenseService
        .getClient()
        .collections(this.typesenseService.getCollectionName())
        .documents(productId)
        .delete();

      this.logger.log(`Deleted product ${productId} from index`);
    } catch (error) {
      this.logger.error(
        `Failed to delete product ${productId} from index`,
        error,
      );
      throw error;
    }
  }

  // ─── Aliases used by test scripts and external callers ───────────────────

  /** Alias for indexProduct — upsert a single document. */
  async upsertProduct(product: IndexableProduct): Promise<void> {
    return this.indexProduct(product);
  }

  /** Alias for bulkIndexProducts — batch-upsert documents. */
  async bulkUpsertProducts(products: IndexableProduct[]): Promise<void> {
    return this.bulkIndexProducts(products);
  }

  /**
   * Drop and recreate the Typesense collection.
   * Use before a full reindex when the schema has changed.
   */
  async dropAndRecreateCollection(): Promise<void> {
    return this.typesenseService.dropAndRecreateCollection();
  }

  // ─── Popularity score helpers ─────────────────────────────────────────────

  /**
   * Positional-args version used by test scripts and ProductsService.
   * createdAt is included so freshness can be factored in if desired.
   */
  calculatePopularityScore(
    salesCount: number,
    rating: number,
    ratingCount: number,
    _createdAt: Date,
  ): number {
    const salesWeight = 0.5;
    const ratingWeight = 0.3;
    const ratingCountWeight = 0.2;

    const salesNorm = Math.min(salesCount / 1000, 1);
    const ratingNorm = rating / 5;
    const ratingCountNorm = Math.min(ratingCount / 500, 1);

    return (
      salesNorm * salesWeight +
      ratingNorm * ratingWeight +
      ratingCountNorm * ratingCountWeight
    );
  }

  /**
   * Object-arg version — kept for backward compatibility.
   */
  computePopularityScore(product: {
    sales_count?: number;
    rating?: number;
    rating_count?: number;
  }): number {
    return this.calculatePopularityScore(
      product.sales_count ?? 0,
      product.rating ?? 0,
      product.rating_count ?? 0,
      new Date(),
    );
  }
}
