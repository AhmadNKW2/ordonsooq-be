export interface SearchHit {
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

export interface FacetCount {
  field_name: string;
  counts: Array<{
    value: string;
    count: number;
  }>;
}

export class SearchResponseDto {
  hits: SearchHit[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  facets?: FacetCount[];
  search_time_ms?: number;
}

export class AutocompleteResponseDto {
  suggestions: Array<{
    id: string;
    name_en: string;
    name_ar: string;
    image?: string;
  }>;
}
