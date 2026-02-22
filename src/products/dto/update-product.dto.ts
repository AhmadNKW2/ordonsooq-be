import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  IsObject,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../entities/product.entity';

// ==================== MEDIA ====================

/**
 * Media item DTO for syncing media with products
 *
 * - media_id: ID from /api/media/upload response (existing uploaded file)
 * - is_primary: Whether this is the primary image (default: false)
 * - sort_order: Display order (default: 0)
 * - combination: Optional - for variant products, maps attribute_id -> attribute_value_id
 *                to assign media to a specific variant group
 */
export class MediaItemDto {
  @IsNumber()
  media_id: number;

  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

  @IsBoolean()
  @IsOptional()
  is_group_primary?: boolean;

  @IsNumber()
  @IsOptional()
  sort_order?: number;

  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;
}

// ==================== ATTRIBUTES MANAGEMENT ====================

/**
 * Product attribute DTO - handles both add and update
 */
export class ProductAttributeDto {
  @IsNumber()
  attribute_id: number;

  @IsBoolean()
  @IsOptional()
  controls_pricing?: boolean;

  @IsBoolean()
  @IsOptional()
  controls_media?: boolean;

  @IsBoolean()
  @IsOptional()
  controls_weight?: boolean;
}

// ==================== PRICING ====================

/**
 * Unified price DTO - works for both simple and variant products
 * - For simple products: omit combination or use empty object
 * - For variant products: provide combination mapping attribute_id -> attribute_value_id
 */
export class PriceDto {
  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;

  @IsNumber()
  @IsOptional()
  cost?: number;

  @IsNumber()
  price: number;

  @IsNumber()
  @IsOptional()
  sale_price?: number;
}

// ==================== WEIGHT ====================

/**
 * Unified weight DTO - works for both simple and variant products
 * - For simple products: omit combination or use empty object
 * - For variant products: provide combination mapping attribute_id -> attribute_value_id
 */
export class WeightDto {
  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;

  @IsNumber()
  @IsOptional()
  weight?: number;

  @IsNumber()
  @IsOptional()
  length?: number;

  @IsNumber()
  @IsOptional()
  width?: number;

  @IsNumber()
  @IsOptional()
  height?: number;
}

// ==================== STOCK ====================

/**
 * Unified stock DTO - works for both simple and variant products
 * - For simple products: omit combination or use empty object
 * - For variant products: provide combination mapping attribute_id -> attribute_value_id
 */
export class StockDto {
  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;

  @IsNumber()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsBoolean()
  @IsOptional()
  is_out_of_stock?: boolean;
}

// ==================== MAIN UPDATE DTO ====================

/**
 * Full update DTO for products (PUT request)
 *
 * The payload represents the COMPLETE state of the product.
 * All basic product information is required.
 *
 * For attributes, prices, weights, and stocks:
 * - Existing data is REPLACED with what's in the payload
 * - If a field is not provided or is empty, existing data will be cleared
 * - Media is managed separately via media_management
 */
export class UpdateProductDto {
  // ============== Basic Product Info (Required) ==============

  @IsString()
  @MaxLength(200)
  name_en: string;

  @IsString()
  @MaxLength(200)
  name_ar: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  sku?: string;

  @IsString()
  @MaxLength(500)
  short_description_en: string;

  @IsString()
  @MaxLength(500)
  short_description_ar: string;

  @IsString()
  long_description_en: string;

  @IsString()
  long_description_ar: string;

  @IsArray()
  @IsNumber({}, { each: true })
  category_ids: number[];

  @IsNumber()
  @IsOptional()
  vendor_id?: number;

  @IsNumber()
  @IsOptional()
  brand_id?: number;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsBoolean()
  @IsOptional()
  visible?: boolean;

  // ============== Media ==============

  /**
   * Media array - REPLACES all existing media for this product
   *
   * Sync logic:
   * - Media IDs in payload but not in DB -> Link to product
   * - Media IDs in DB but not in payload -> Unlink from product
   * - Media IDs in both -> Update is_primary, sort_order, combination
   *
   * If not provided, media is not changed.
   * If empty array, all media is unlinked.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  @IsOptional()
  media?: MediaItemDto[];

  // ============== Attributes Management ==============

  /**
   * Product attributes - REPLACES all existing attributes
   * If empty array or not provided, all existing attributes and variants will be removed
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  @IsOptional()
  attributes?: ProductAttributeDto[];

  // ============== Pricing ==============

  /**
   * Unified prices array
   * - Simple product: [{ cost, price, sale_price }]
   * - Variant product: [{ combination: { "1": 2 }, cost, price, sale_price }, ...]
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceDto)
  @IsOptional()
  prices?: PriceDto[];

  // ============== Weight ==============

  /**
   * Unified weights array
   * - Simple product: [{ weight, length, width, height }]
   * - Variant product: [{ combination: { "1": 2 }, weight, length, width, height }, ...]
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeightDto)
  @IsOptional()
  weights?: WeightDto[];

  // ============== Stock ==============

  /**
   * Unified stocks array
   * - Simple product: [{ quantity }]
   * - Variant product: [{ combination: { "1": 2, "2": 3 }, quantity }, ...]
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockDto)
  @IsOptional()
  stocks?: StockDto[];
}
