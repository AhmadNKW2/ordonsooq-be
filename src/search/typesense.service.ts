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
  }

  private initializeClient() {
    // DEBUG: log what keys we're actually reading at runtime
    this.logger.log(`--- TYPESENSE DEBUG ---`);
    this.logger.log(`RAW ENV KEY: ${process.env.TYPESENSE_API_KEY}`);
    this.logger.log(`CONFIG KEY: ${this.configService.get<string>('typesense.apiKey')}`);
    this.logger.log(`HOST: ${process.env.TYPESENSE_HOST}`);

    // Read directly from process.env to bypass any ConfigModule wiring issues
    const apiKey = process.env.TYPESENSE_API_KEY || this.configService.get<string>('typesense.apiKey') || '';
    const host = process.env.TYPESENSE_HOST || this.configService.get<string>('typesense.host') || 'localhost';
    const port = parseInt(process.env.TYPESENSE_PORT || '') || this.configService.get<number>('typesense.port') || 8108;
    const protocol = process.env.TYPESENSE_PROTOCOL || this.configService.get<string>('typesense.protocol') || 'http';

    this.client = new Typesense.Client({
      nodes: [{ host, port, protocol }],
      apiKey,
      connectionTimeoutSeconds:
        this.configService.get<number>('typesense.connectionTimeoutSeconds') ?? 10,
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
    const collectionName =
      this.configService.get<string>('typesense.collectionName') ?? 'products';

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
        { name: 'id', type: 'string' as const },

        { name: 'name_en', type: 'string' as const, locale: 'en' },
        { name: 'name_ar', type: 'string' as const, locale: 'ar' },

        {
          name: 'description_en',
          type: 'string' as const,
          locale: 'en',
          optional: true,
        },
        {
          name: 'description_ar',
          type: 'string' as const,
          locale: 'ar',
          optional: true,
        },

        { name: 'brand', type: 'string' as const, facet: true },
        { name: 'category', type: 'string' as const, facet: true },
        {
          name: 'subcategory',
          type: 'string' as const,
          facet: true,
          optional: true,
        },

        {
          name: 'tags',
          type: 'string[]' as const,
          facet: false,
          optional: true,
        },

        { name: 'price', type: 'float' as const, facet: true },
        {
          name: 'sale_price',
          type: 'float' as const,
          optional: true,
          facet: false,
        },

        {
          name: 'rating',
          type: 'float' as const,
          facet: true,
          optional: true,
        },
        { name: 'rating_count', type: 'int32' as const, optional: true },

        { name: 'stock_quantity', type: 'int32' as const },
        { name: 'is_available', type: 'bool' as const, facet: true },

        { name: 'images', type: 'string[]' as const, optional: true },

        { name: 'created_at', type: 'int64' as const },

        { name: 'popularity_score', type: 'float' as const },

        {
          name: 'seller_id',
          type: 'string' as const,
          optional: true,
          facet: true,
        },

        { name: 'sales_count', type: 'int32' as const, optional: true },
      ],
      default_sorting_field: 'popularity_score',
    };

    await this.client.collections().create(schema);
    this.logger.log(`✅ Collection "${name}" created successfully`);
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
