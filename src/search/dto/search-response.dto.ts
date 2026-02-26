export interface SearchHit {
  id: string;
  slug?: string;
  sku?: string;
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;
  brand: string;
  brand_id?: number;
  category: string;
  subcategory?: string;
  category_ids?: number[];
  category_names_en?: string[];
  category_names_ar?: string[];
  tags?: string[];
  price: number;
  sale_price?: number;
  price_min: number;
  price_max: number;
  rating?: number;
  rating_count?: number;
  stock_quantity: number;
  in_stock: boolean;
  is_available: boolean;
  attr_pairs?: string[];
  images?: string[];
  created_at: number;
  popularity_score: number;
  vendor_id?: number;
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
    slug?: string;
    name_en: string;
    name_ar: string;
    image?: string;
    price_min?: number;
  }>;
}
