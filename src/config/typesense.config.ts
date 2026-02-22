import { registerAs } from '@nestjs/config';

export default registerAs('typesense', () => ({
  host: process.env.TYPESENSE_HOST ?? 'localhost',
  port: parseInt(process.env.TYPESENSE_PORT ?? '8108', 10) || 8108,
  protocol: process.env.TYPESENSE_PROTOCOL ?? 'http',
  apiKey: process.env.TYPESENSE_API_KEY ?? '',
  collectionName: process.env.TYPESENSE_COLLECTION_NAME ?? 'products',
  connectionTimeoutSeconds:
    parseInt(process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS ?? '10', 10) ||
    10,
  searchDefaultPerPage:
    parseInt(process.env.SEARCH_DEFAULT_PER_PAGE ?? '20', 10) || 20,
  searchAutocompletePerPage:
    parseInt(process.env.SEARCH_AUTOCOMPLETE_PER_PAGE ?? '8', 10) || 8,
  searchMaxTypos:
    parseInt(process.env.SEARCH_MAX_TYPOS ?? '2', 10) || 2,
  searchCacheTtlSeconds:
    parseInt(process.env.SEARCH_CACHE_TTL_SECONDS ?? '300', 10) || 300,
  searchAutocompleteCacheTtlSeconds:
    parseInt(
      process.env.SEARCH_AUTOCOMPLETE_CACHE_TTL_SECONDS ?? '60',
      10,
    ) || 60,
}));
