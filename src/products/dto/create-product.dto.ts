import {
    IsString,
    IsNumber,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsArray,
    ValidateNested,
    MaxLength,
    IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PricingType } from '../entities/product.entity';

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

// Pricing DTO
class PricingInput {
    @IsNumber()
    cost: number;

    @IsNumber()
    price: number;

    @IsNumber()
    @IsOptional()
    sale_price?: number;
}

// Weight DTO
class WeightInput {
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
 * Price group input - group pricing by controlling attribute values
 * 
 * Example:
 * {
 *   "combination": { "2": 5 },  // attribute_id 2 (Color) -> value_id 5 (Red)
 *   "cost": 10,
 *   "price": 25,
 *   "sale_price": 20
 * }
 */
class PriceGroupInput {
    @IsObject()
    combination: Record<string, number>;

    @IsNumber()
    cost: number;

    @IsNumber()
    price: number;

    @IsNumber()
    @IsOptional()
    sale_price?: number;
}

/**
 * Weight group input - group weights by controlling attribute values
 * 
 * Example:
 * {
 *   "combination": { "3": 10 },  // attribute_id 3 (Size) -> value_id 10 (Large)
 *   "weight": 500,
 *   "length": 30,
 *   "width": 20,
 *   "height": 10
 * }
 */
class WeightGroupInput {
    @IsObject()
    combination: Record<string, number>;

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
 * Variant input for creating a variant with its stock
 * Note: Pricing and weight are now handled separately via groups
 * 
 * Example:
 * {
 *   "attribute_value_ids": [5, 10],  // Red (5) + Small (10)
 *   "sku_suffix": "-RED-SM",
 *   "stock_quantity": 50
 * }
 */
class VariantInput {
    @IsArray()
    @IsNumber({}, { each: true })
    attribute_value_ids: number[];

    @IsString()
    @IsOptional()
    sku_suffix?: string;

    @IsNumber()
    @IsOptional()
    stock_quantity?: number;
}

/**
 * Main DTO for product creation
 * 
 * For simple products:
 * - Set pricing_type = 'single'
 * - Provide single_pricing, product_weight, stock_quantity
 * 
 * For variant products:
 * - Set pricing_type = 'variant'
 * - Provide attributes (which attributes the product has)
 * - Provide variants array with each variant's details
 *   OR set auto_generate_variants = true to generate all possible variants
 */
export class CreateProductDto {
    // Basic product info
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

    @IsEnum(PricingType)
    pricing_type: PricingType;

    @IsNumber()
    category_id: number;

    @IsNumber()
    @IsOptional()
    vendor_id?: number;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    // ============== Simple Product Fields ==============

    /**
     * Single pricing for simple products (pricing_type = 'single')
     */
    @ValidateNested()
    @Type(() => PricingInput)
    @IsOptional()
    single_pricing?: PricingInput;

    /**
     * Product weight for simple products
     */
    @ValidateNested()
    @Type(() => WeightInput)
    @IsOptional()
    product_weight?: WeightInput;

    /**
     * Stock quantity for simple products
     */
    @IsNumber()
    @IsOptional()
    stock_quantity?: number;

    // ============== Variant Product Fields ==============

    /**
     * Attributes to add to the product (for variant products)
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductAttributeInput)
    @IsOptional()
    attributes?: ProductAttributeInput[];

    /**
     * Variants to create with their stock
     * Pricing and weight are handled via price_groups and weight_groups
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariantInput)
    @IsOptional()
    variants?: VariantInput[];

    /**
     * Price groups for variant products
     * Groups variants by pricing-controlling attribute values
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PriceGroupInput)
    @IsOptional()
    price_groups?: PriceGroupInput[];

    /**
     * Weight groups for variant products
     * Groups variants by weight-controlling attribute values
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WeightGroupInput)
    @IsOptional()
    weight_groups?: WeightGroupInput[];

    /**
     * Auto-generate all possible variants based on attribute combinations
     * When true, creates variants for all attribute value combinations
     */
    @IsBoolean()
    @IsOptional()
    auto_generate_variants?: boolean;
}
