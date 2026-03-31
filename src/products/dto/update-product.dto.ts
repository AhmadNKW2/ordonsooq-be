import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { ProductSpecificationInputDto } from './product-specification.dto';

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

// ==================== VARIANT ====================

export class VariantDto {
  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
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
  @MaxLength(300)
  name_en: string;

  @IsString()
  @MaxLength(300)
  name_ar: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  sku?: string;

  @IsString()
  short_description_en: string;

  @IsString()
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
  @ApiPropertyOptional({
    type: [ProductAttributeDto],
    example: [
      {
        attribute_id: 21,
        controls_pricing: true,
        controls_media: false,
        controls_weight: false,
      },
      {
        attribute_id: 22,
        controls_pricing: false,
        controls_media: true,
        controls_weight: false,
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeDto)
  @IsOptional()
  attributes?: ProductAttributeDto[];

  // ============== Specifications Management ====================

  /**
   * Product specifications - REPLACES all existing product specification values.
   * If empty array, all product specifications are removed.
   * If omitted, specifications are not changed.
   */
  @ApiPropertyOptional({
    type: [ProductSpecificationInputDto],
    example: [
      { specification_id: 1, specification_value_ids: [60] },
      { specification_id: 4, specification_value_ids: [7, 8, 39] },
      { specification_id: 8, specification_value_ids: [50] },
      { specification_id: 9, specification_value_ids: [49] },
      { specification_id: 10, specification_value_ids: [35] },
      { specification_id: 11, specification_value_ids: [67] },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationInputDto)
  @IsOptional()
  specifications?: ProductSpecificationInputDto[];

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

  // ============== Variants ==============

  /**
   * Explicit variants array to define is_active and other specific variant statuses.
   * If not provided, variants will be deduced implicitly from combinations in prices, weights, and stocks.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  @IsOptional()
  variants?: VariantDto[];

  // ============== Tags ==============

  /**
   * Full replacement list of tag names for this product.
   * Pass an empty array [] to remove all tags.
   * Omit the field entirely to leave tags unchanged.
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
