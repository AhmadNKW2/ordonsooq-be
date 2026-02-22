import { Injectable, Logger } from '@nestjs/common';
import { TypesenseService } from './typesense.service';

export interface IndexableProduct {
  id: string;
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;
  brand: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  price: number;
  sale_price?: number;
  rating?: number;
  rating_count?: number;
  stock_quantity: number;
  is_available: boolean;
  images?: string[];
  created_at: number;
  popularity_score: number;
  seller_id?: string;
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
