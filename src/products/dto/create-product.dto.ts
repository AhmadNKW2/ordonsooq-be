import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  MaxLength,
  IsObject,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '../entities/product.entity';

// Product attribute DTO
class ProductAttributeInput {
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

/**
 * Unified price DTO - works for both simple and variant products
 * - For simple products: omit combination or use empty object
 * - For variant products: provide combination mapping attribute_id -> attribute_value_id
 */
class PriceInput {
  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;

  @IsNumber()
  cost: number;

  @IsNumber()
  price: number;

  @IsNumber()
  @IsOptional()
  sale_price?: number;
}

/**
 * Unified weight DTO - works for both simple and variant products
 * - For simple products: omit combination or use empty object
 * - For variant products: provide combination mapping attribute_id -> attribute_value_id
 */
class WeightInput {
  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;

  @IsNumber()
  weight: number;

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

/**
 * Unified stock DTO - works for both simple and variant products
 * - For simple products: omit combination or use empty object
 * - For variant products: provide combination mapping attribute_id -> attribute_value_id
 */
class StockInput {
  @IsObject()
  @IsOptional()
  combination?: Record<string, number>;

  @IsNumber()
  @Min(0)
  quantity: number;
}

/**
 * Media item DTO for linking pre-uploaded media to products
 */
class MediaInput {
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

/**
 * Main DTO for product creation
 *
 * For simple products:
 * - Provide prices, weights, stocks without combination
 * - Do not provide attributes
 *
 * For variant products:
 * - Provide attributes (which attributes the product has)
 * - Provide prices, weights, stocks with combination
 */
export class CreateProductDto {
  // Basic product info
  @IsString()
  @MaxLength(200)
  name_en: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  slug?: string;

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
   * Media to link to the product
   * Use media_id from /api/media/upload response
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaInput)
  @IsOptional()
  media?: MediaInput[];

  // ============== Attributes ==============

  /**
   * Attributes to add to the product (for variant products)
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeInput)
  @IsOptional()
  attributes?: ProductAttributeInput[];

  // ============== Pricing ==============

  /**
   * Unified prices array
   * - Simple product: [{ cost, price, sale_price }]
   * - Variant product: [{ combination: { "1": 2 }, cost, price, sale_price }, ...]
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceInput)
  @IsOptional()
  prices?: PriceInput[];

  // ============== Weight ==============

  /**
   * Unified weights array
   * - Simple product: [{ weight, length, width, height }]
   * - Variant product: [{ combination: { "1": 2 }, weight, length, width, height }, ...]
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeightInput)
  @IsOptional()
  weights?: WeightInput[];

  // ============== Stock ==============

  /**
   * Unified stocks array
   * - Simple product: [{ quantity }]
   * - Variant product: [{ combination: { "1": 2, "2": 3 }, quantity }, ...]
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockInput)
  @IsOptional()
  stocks?: StockInput[];
}
