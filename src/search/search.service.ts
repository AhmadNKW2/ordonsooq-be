import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { TypesenseService } from './typesense.service';
import { SearchQueryDto, AutocompleteQueryDto } from './dto/search-query.dto';
import {
  SearchResponseDto,
  AutocompleteResponseDto,
} from './dto/search-response.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly typesenseService: TypesenseService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async search(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const cacheKey = `search:${JSON.stringify(dto)}`;
    const cacheTtl = this.configService.get<number>(
      'typesense.searchCacheTtlSeconds',
    );

    const cached = await this.cacheManager.get<SearchResponseDto>(cacheKey);
    if (cached) return cached;

    const perPage =
      dto.per_page ??
      (this.configService.get<number>('typesense.searchDefaultPerPage') ?? 20);

    // ── Build filter_by ─────────────────────────────────────────────────────
    const filterBy: string[] = [
      'is_available:=true',
    ];

    // Text-label filters (exact match on facet fields)
    if (dto.brand) filterBy.push(`brand:=${dto.brand}`);
    if (dto.category) filterBy.push(`category:=${dto.category}`);
    if (dto.subcategory) filterBy.push(`subcategory:=${dto.subcategory}`);

    // ID-based filters
    if (dto.brand_id !== undefined) filterBy.push(`brand_id:=${dto.brand_id}`);
    if (dto.vendor_id !== undefined) filterBy.push(`vendor_id:=${dto.vendor_id}`);
    if (dto.seller_id) filterBy.push(`seller_id:=${dto.seller_id}`);

    // Category ID filters (single or multi)
    if (dto.category_id !== undefined) {
      filterBy.push(`category_ids:=[${dto.category_id}]`);
    } else if (dto.category_ids?.length) {
      filterBy.push(`category_ids:=[${dto.category_ids.join(',')}]`);
    }

    // Price range — filter on price_min for the lower bound, price_max for upper
    if (dto.min_price !== undefined || dto.max_price !== undefined) {
      const min = dto.min_price ?? 0;
      const max = dto.max_price ?? 9999999;
      filterBy.push(`price_min:>=${min}`);
      if (dto.max_price !== undefined) filterBy.push(`price_max:<=${max}`);
    }

    // Stock
    if (dto.in_stock === true) filterBy.push('in_stock:=true');

    // Rating floor
    if (dto.rating_min !== undefined) {
      filterBy.push(`rating:>=${dto.rating_min}`);
    }

    // Attribute pair filters — each adds an AND condition
    if (dto.attrs?.length) {
      for (const pair of dto.attrs) {
        filterBy.push(`attr_pairs:="${pair}"`);
      }
    }

    // ── Build sort_by ───────────────────────────────────────────────────────
    // Map old sort keys → new field names
    const rawSort = dto.sort_by ?? 'popularity_score:desc';
    const sortBy = rawSort
      .replace('price:asc', 'price_min:asc')
      .replace('price:desc', 'price_min:desc');

    const searchParams = {
      q: dto.q,
      query_by:
        'name_en,name_ar,brand,tags,category_names_en,category_names_ar,description_en,description_ar',
      query_by_weights: '5,5,3,4,2,2,1,1',
      filter_by: filterBy.join(' && '),
      sort_by: sortBy,
      page: dto.page ?? 1,
      per_page: perPage,
      num_typos:
        this.configService.get<number>('typesense.searchMaxTypos') ?? 2,
      facet_by:
        'brand,brand_id,category,category_ids,vendor_id,price_min,price_max,rating,in_stock,is_available,attr_pairs',
      max_facet_values: 30,
    };

    const start = Date.now();
    const result = await this.typesenseService
      .getClient()
      .collections(this.typesenseService.getCollectionName())
      .documents()
      .search(searchParams as any);

    const total = result.found ?? 0;
    const response: SearchResponseDto = {
      hits: (result.hits ?? []).map((h) => h.document as any),
      total,
      page: dto.page ?? 1,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      facets: (result.facet_counts ?? []).map((fc) => ({
        field_name: fc.field_name,
        counts: fc.counts.map((c) => ({ value: c.value, count: c.count })),
      })),
      search_time_ms: Date.now() - start,
    };

    await this.cacheManager.set(cacheKey, response, (cacheTtl ?? 300) * 1000);
    return response;
  }

  async autocomplete(
    dto: AutocompleteQueryDto,
  ): Promise<AutocompleteResponseDto> {
    const cacheKey = `autocomplete:${dto.q}:${dto.per_page}`;
    const cacheTtl =
      this.configService.get<number>(
        'typesense.searchAutocompleteCacheTtlSeconds',
      ) ?? 60;

    const cached =
      await this.cacheManager.get<AutocompleteResponseDto>(cacheKey);
    if (cached) return cached;

    const perPage =
      dto.per_page ??
      (this.configService.get<number>('typesense.searchAutocompletePerPage') ??
        8);

    const result = await this.typesenseService
      .getClient()
      .collections(this.typesenseService.getCollectionName())
      .documents()
      .search({
        q: dto.q,
        query_by: 'name_en,name_ar,brand,tags',
        query_by_weights: '5,5,2,3',
        filter_by: 'is_available:=true && in_stock:=true',
        sort_by: 'popularity_score:desc',
        page: 1,
        per_page: perPage,
        num_typos: 1,
        prefix: true,
      } as any);

    const response: AutocompleteResponseDto = {
      suggestions: (result.hits ?? []).map((h) => {
        const doc = h.document as any;
        return {
          id: doc.id,
          slug: doc.slug,
          name_en: doc.name_en,
          name_ar: doc.name_ar,
          image: (doc.images as string[] | undefined)?.[0],
          price_min: doc.price_min,
        };
      }),
    };

    await this.cacheManager.set(cacheKey, response, cacheTtl * 1000);
    return response;
  }
}
