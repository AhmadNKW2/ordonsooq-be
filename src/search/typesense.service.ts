import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Typesense from 'typesense';
import { Client } from 'typesense';

@Injectable()
export class TypesenseService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(TypesenseService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.initializeClient();
    await this.waitForTypesense();
    await this.ensureCollectionExists();
    // Approved synonyms are seeded by SynonymConceptService after DB is ready
  }

  private initializeClient() {
    this.logger.log(`--- TYPESENSE DEBUG ---`);
    this.logger.log(`RAW ENV KEY: ${process.env.TYPESENSE_API_KEY}`);
    this.logger.log(`CONFIG KEY: ${this.configService.get<string>('typesense.apiKey')}`);
    this.logger.log(`HOST: ${process.env.TYPESENSE_HOST}`);

    const apiKey =
      process.env.TYPESENSE_API_KEY ||
      this.configService.get<string>('typesense.apiKey') ||
      '';
    const host =
      process.env.TYPESENSE_HOST ||
      this.configService.get<string>('typesense.host') ||
      'localhost';
    const port =
      parseInt(process.env.TYPESENSE_PORT || '') ||
      this.configService.get<number>('typesense.port') ||
      8108;
    const protocol =
      process.env.TYPESENSE_PROTOCOL ||
      this.configService.get<string>('typesense.protocol') ||
      'http';

    this.client = new Typesense.Client({
      nodes: [{ host, port, protocol }],
      apiKey,
      connectionTimeoutSeconds:
        this.configService.get<number>('typesense.connectionTimeoutSeconds') ??
        10,
      numRetries: 3,
      retryIntervalSeconds: 1,
    });
  }

  private async waitForTypesense(retries = 10, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.client.health.retrieve();
        this.logger.log('✅ Typesense connected successfully');
        return;
      } catch {
        this.logger.warn(
          `Typesense not ready, retrying... (${i + 1}/${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('❌ Could not connect to Typesense after multiple retries');
  }

  private async ensureCollectionExists() {
    const collectionName = this.getCollectionName();
    try {
      await this.client.collections(collectionName).retrieve();
      this.logger.log(`Collection "${collectionName}" already exists`);
    } catch {
      await this.createProductsCollection(collectionName);
    }
  }

  private async createProductsCollection(name: string) {
    const schema = {
      name,
      fields: [
        // ── Identity ────────────────────────────────────────────────────────
        { name: 'id', type: 'string' as const },
        { name: 'slug', type: 'string' as const, optional: true, index: false },
        { name: 'sku', type: 'string' as const, optional: true, index: false },

        // ── Search text (bilingual) ──────────────────────────────────────────
        { name: 'name_en', type: 'string' as const, locale: 'en' },
        { name: 'name_ar', type: 'string' as const, locale: 'ar' },
        { name: 'description_en', type: 'string' as const, locale: 'en', optional: true },
        { name: 'description_ar', type: 'string' as const, locale: 'ar', optional: true },

        // ── Relational labels (text search) ──────────────────────────────────
        { name: 'brand', type: 'string' as const, facet: true },
        { name: 'category', type: 'string' as const, facet: true },
        { name: 'subcategory', type: 'string' as const, facet: true, optional: true },
        { name: 'category_names_en', type: 'string[]' as const, optional: true, facet: false },
        { name: 'category_names_ar', type: 'string[]' as const, optional: true, facet: false },
        { name: 'tags', type: 'string[]' as const, optional: true, facet: false },

        // ── Relational IDs (facet filter) ────────────────────────────────────
        { name: 'brand_id', type: 'int32' as const, optional: true, facet: true },
        { name: 'vendor_id', type: 'int32' as const, optional: true, facet: true },
        { name: 'seller_id', type: 'string' as const, optional: true, facet: false },
        { name: 'category_ids', type: 'int32[]' as const, optional: true, facet: true },

        // ── Pricing ───────────────────────────────────────────────────────────
        { name: 'price', type: 'float' as const, facet: true },
        { name: 'sale_price', type: 'float' as const, optional: true, facet: false },
        { name: 'price_min', type: 'float' as const, facet: true },
        { name: 'price_max', type: 'float' as const, facet: true },

        // ── Availability ──────────────────────────────────────────────────────
        { name: 'stock_quantity', type: 'int32' as const },
        { name: 'in_stock', type: 'bool' as const, facet: true },
        { name: 'is_available', type: 'bool' as const, facet: true },

        // ── Attributes (multi-attr filter) ────────────────────────────────────
        { name: 'attr_pairs', type: 'string[]' as const, optional: true, facet: true },

        // ── Rating ────────────────────────────────────────────────────────────
        { name: 'rating', type: 'float' as const, facet: true, optional: true },
        { name: 'rating_count', type: 'int32' as const, optional: true },

        // ── Media ─────────────────────────────────────────────────────────────
        { name: 'images', type: 'string[]' as const, optional: true, index: false },

        // ── Sort signals ──────────────────────────────────────────────────────
        { name: 'created_at', type: 'int64' as const },
        { name: 'popularity_score', type: 'float' as const },
        { name: 'sales_count', type: 'int32' as const, optional: true },
      ],
      default_sorting_field: 'popularity_score',
    };

    await this.client.collections().create(schema);
    this.logger.log(`✅ Collection "${name}" created successfully`);
  }

  // ── Synonym management ─────────────────────────────────────────────────────

  /**
   * Upsert a multi-way synonym group into Typesense.
   * @param synonymId  Unique key (= concept_key from DB)
   * @param terms      All terms (EN + AR combined)
   */
  async upsertSynonym(synonymId: string, terms: string[]): Promise<void> {
    await this.client
      .collections(this.getCollectionName())
      .synonyms()
      .upsert(synonymId, { synonyms: terms });
    this.logger.log(`✅ Synonym "${synonymId}" upserted (${terms.length} terms)`);
  }

  /**
   * Delete a synonym from Typesense. Safe to call even if it doesn't exist.
   */
  async deleteSynonym(synonymId: string): Promise<void> {
    try {
      await this.client
        .collections(this.getCollectionName())
        .synonyms(synonymId)
        .delete();
      this.logger.log(`🗑️  Synonym "${synonymId}" deleted from Typesense`);
    } catch (err: any) {
      if (err?.httpStatus !== 404) throw err;
    }
  }

  /**
   * Seed all approved synonyms idempotently.
   * Called by SynonymConceptService on startup to restore after Typesense reset.
   */
  async seedSynonyms(
    synonyms: Array<{ id: string; terms: string[] }>,
  ): Promise<void> {
    if (!synonyms.length) {
      this.logger.log('No approved synonyms to seed');
      return;
    }
    for (const s of synonyms) {
      await this.upsertSynonym(s.id, s.terms);
    }
    this.logger.log(`✅ Seeded ${synonyms.length} synonyms into Typesense`);
  }

  /**
   * Drop and recreate the collection — clears ALL indexed data.
   * Use only before a full reindex operation.
   */
  async dropAndRecreateCollection(): Promise<void> {
    const name = this.getCollectionName();
    try {
      await this.client.collections(name).delete();
    } catch {
      // ignore if doesn't exist
    }
    await this.createProductsCollection(name);
    this.logger.log(`✅ Collection "${name}" dropped and recreated`);
  }

  getClient(): Client {
    return this.client;
  }

  getCollectionName(): string {
    return (
      this.configService.get<string>('typesense.collectionName') ?? 'products'
    );
  }
}
