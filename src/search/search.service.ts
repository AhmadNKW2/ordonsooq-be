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

    const filterBy: string[] = [];
    if (dto.brand) filterBy.push(`brand:=${dto.brand}`);
    if (dto.category) filterBy.push(`category:=${dto.category}`);
    if (dto.subcategory) filterBy.push(`subcategory:=${dto.subcategory}`);
    if (dto.seller_id) filterBy.push(`seller_id:=${dto.seller_id}`);
    if (dto.min_price !== undefined || dto.max_price !== undefined) {
      const min = dto.min_price ?? 0;
      const max = dto.max_price ?? Number.MAX_SAFE_INTEGER;
      filterBy.push(`price:[${min}..${max}]`);
    }
    filterBy.push('is_available:=true');

    const searchParams = {
      q: dto.q,
      query_by: 'name_en,name_ar,description_en,description_ar,brand,tags',
      query_by_weights: '5,5,2,2,3,2',
      filter_by: filterBy.join(' && '),
      sort_by: dto.sort_by ?? 'popularity_score:desc',
      page: dto.page ?? 1,
      per_page: perPage,
      num_typos:
        this.configService.get<number>('typesense.searchMaxTypos') ?? 2,
      facet_by: 'brand,category,subcategory,price,rating,is_available',
      max_facet_values: 20,
    };

    const start = Date.now();
    const result = await this.typesenseService
      .getClient()
      .collections(this.typesenseService.getCollectionName())
      .documents()
      .search(searchParams);

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
        filter_by: 'is_available:=true',
        sort_by: 'popularity_score:desc',
        page: 1,
        per_page: perPage,
        num_typos: 1,
        prefix: true,
      });

    const response: AutocompleteResponseDto = {
      suggestions: (result.hits ?? []).map((h) => {
        const doc = h.document as any;
        return {
          id: doc.id,
          name_en: doc.name_en,
          name_ar: doc.name_ar,
          image: (doc.images as string[] | undefined)?.[0],
        };
      }),
    };

    await this.cacheManager.set(cacheKey, response, cacheTtl * 1000);
    return response;
  }
}
