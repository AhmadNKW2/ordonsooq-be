import {
    IsString,
    IsNumber,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsArray,
    ValidateNested,
    MaxLength,
    Min,
    IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PricingType } from '../entities/product.entity';

// ==================== MEDIA MANAGEMENT ====================

/**
 * Media management DTO
 */
export class MediaManagementDto {
    @IsArray()
    @IsNumber({}, { each: true })
    @IsOptional()
    delete_media_ids?: number[];
}

// ==================== ATTRIBUTES MANAGEMENT ====================

export class AddProductAttributeDto {
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

export class UpdateProductAttributeDto {
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

// ==================== PRICING MANAGEMENT ====================

export class UpdateSinglePricingDto {
    @IsNumber()
    cost: number;

    @IsNumber()
    price: number;

    @IsNumber()
    @IsOptional()
    sale_price?: number;
}

/**
 * Price group update DTO
 * Uses combination object mapping attribute_id -> attribute_value_id
 */
export class UpdatePriceGroupDto {
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

// ==================== WEIGHT MANAGEMENT ====================

export class UpdateWeightDto {
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
 * Weight group update DTO
 * Uses combination object mapping attribute_id -> attribute_value_id
 */
export class UpdateWeightGroupDto {
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

// ==================== STOCK MANAGEMENT ====================

export class UpdateVariantStockDto {
    @IsNumber()
    variant_id: number;

    @IsNumber()
    @Min(0)
    quantity: number;
}

// ==================== MAIN UPDATE DTO ====================

/**
 * Comprehensive update DTO for products
 * 
 * Updates are applied based on what fields are provided:
 * - Basic info: name, description, category, etc.
 * - Media: delete or set primary
 * - Attributes: add, update flags, or delete
 * - Pricing: update single or variant pricing
 * - Weight: update single or variant weight
 * - Stock: update single or variant stock
 */
export class UpdateProductDto {
    // ============== Basic Product Info ==============
    
    @IsString()
    @MaxLength(200)
    @IsOptional()
    name_en?: string;

    @IsString()
    @MaxLength(200)
    @IsOptional()
    name_ar?: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    sku?: string;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    short_description_en?: string;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    short_description_ar?: string;

    @IsString()
    @IsOptional()
    long_description_en?: string;

    @IsString()
    @IsOptional()
    long_description_ar?: string;

    @IsEnum(PricingType)
    @IsOptional()
    pricing_type?: PricingType;

    @IsNumber()
    @IsOptional()
    category_id?: number;

    @IsNumber()
    @IsOptional()
    vendor_id?: number;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    // ============== Media Management ==============

    @ValidateNested()
    @Type(() => MediaManagementDto)
    @IsOptional()
    media_management?: MediaManagementDto;

    // ============== Attributes Management ==============

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AddProductAttributeDto)
    @IsOptional()
    add_attributes?: AddProductAttributeDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateProductAttributeDto)
    @IsOptional()
    update_attributes?: UpdateProductAttributeDto[];

    @IsArray()
    @IsNumber({}, { each: true })
    @IsOptional()
    delete_attribute_ids?: number[];

    // ============== Pricing ==============

    /**
     * Update single pricing (for simple products)
     */
    @ValidateNested()
    @Type(() => UpdateSinglePricingDto)
    @IsOptional()
    single_pricing?: UpdateSinglePricingDto;

    /**
     * Update price groups (for variant products)
     * Each group is identified by its combination of controlling attribute values
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdatePriceGroupDto)
    @IsOptional()
    price_groups?: UpdatePriceGroupDto[];

    // ============== Weight ==============

    /**
     * Update product weight (for simple products)
     */
    @ValidateNested()
    @Type(() => UpdateWeightDto)
    @IsOptional()
    product_weight?: UpdateWeightDto;

    /**
     * Update weight groups (for variant products)
     * Each group is identified by its combination of controlling attribute values
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateWeightGroupDto)
    @IsOptional()
    weight_groups?: UpdateWeightGroupDto[];

    // ============== Stock ==============

    /**
     * Update stock quantity for simple products
     */
    @IsNumber()
    @Min(0)
    @IsOptional()
    stock_quantity?: number;

    /**
     * Update variant stock by variant_id
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateVariantStockDto)
    @IsOptional()
    variant_stocks?: UpdateVariantStockDto[];
}
