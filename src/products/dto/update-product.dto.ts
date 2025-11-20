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
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PricingType } from '../entities/product.entity';

// ==================== BASIC PRODUCT INFO ====================

export class UpdateBasicProductInfoDto {
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
}

// ==================== MEDIA MANAGEMENT ====================

/**
 * Update existing media: change sort order or primary status
 */
export class UpdateMediaDto {
    @IsNumber()
    media_id: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    sort_order?: number;

    @IsBoolean()
    @IsOptional()
    is_primary?: boolean;
}

/**
 * Media to be deleted - just the ID
 */
export class DeleteMediaDto {
    @IsNumber()
    media_id: number;

    @IsBoolean()
    @IsOptional()
    is_variant?: boolean; // true if variant media, false for product media
}

/**
 * Reorder all media at once with new sort orders
 */
export class ReorderMediaDto {
    @IsNumber()
    media_id: number;

    @IsNumber()
    @Min(0)
    sort_order: number;
}

/**
 * Complete media management in one DTO
 */
export class MediaManagementDto {
    // Update existing media (sort order, primary status)
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateMediaDto)
    @IsOptional()
    update_media?: UpdateMediaDto[];

    // Delete media by IDs
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DeleteMediaDto)
    @IsOptional()
    delete_media?: DeleteMediaDto[];

    // Reorder all media - complete sort order update
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReorderMediaDto)
    @IsOptional()
    reorder_media?: ReorderMediaDto[];

    // Set a specific media as primary
    @IsNumber()
    @IsOptional()
    set_primary_media_id?: number;

    @IsBoolean()
    @IsOptional()
    is_variant_media?: boolean; // for set_primary_media_id
}

// ==================== ATTRIBUTES MANAGEMENT ====================

export class UpdateProductAttributeInputDto {
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

export class AddProductAttributeInputDto {
    @IsNumber()
    attribute_id: number;

    @IsBoolean()
    controls_pricing: boolean;

    @IsBoolean()
    controls_media: boolean;

    @IsBoolean()
    controls_weight: boolean;
}

// ==================== PRICING MANAGEMENT ====================

export class UpdateSinglePricingDto {
    @IsNumber()
    @IsOptional()
    cost?: number;

    @IsNumber()
    @IsOptional()
    price?: number;

    @IsNumber()
    @IsOptional()
    sale_price?: number;
}

export class UpdateVariantPricingDto {
    @IsObject()
    combination: Record<string, number>; // { "Color": 1, "Size": 3 }

    @IsNumber()
    @IsOptional()
    cost?: number;

    @IsNumber()
    @IsOptional()
    price?: number;

    @IsNumber()
    @IsOptional()
    sale_price?: number;
}

// ==================== WEIGHT MANAGEMENT ====================

export class UpdateWeightDto {
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

export class UpdateVariantWeightDto {
    @IsObject()
    combination: Record<string, number>;

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

// ==================== STOCK MANAGEMENT ====================

export class UpdateStockInputDto {
    @IsObject()
    combination: Record<string, number>;

    @IsNumber()
    stock_quantity: number;
}

// ==================== MAIN UPDATE DTO ====================

/**
 * Comprehensive DTO for updating products
 * Send fields directly - no need for basic_info wrapper
 */
export class UpdateProductDto {
    // ========== BASIC INFORMATION ==========
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

    // ========== MEDIA MANAGEMENT ==========
    @ValidateNested()
    @Type(() => MediaManagementDto)
    @IsOptional()
    media_management?: MediaManagementDto;

    // ========== ATTRIBUTES ==========
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AddProductAttributeInputDto)
    @IsOptional()
    add_attributes?: AddProductAttributeInputDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateProductAttributeInputDto)
    @IsOptional()
    update_attributes?: UpdateProductAttributeInputDto[];

    @IsArray()
    @IsNumber({}, { each: true })
    @IsOptional()
    delete_attribute_ids?: number[];

    // ========== PRICING ==========
    @ValidateNested()
    @Type(() => UpdateSinglePricingDto)
    @IsOptional()
    single_pricing?: UpdateSinglePricingDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateVariantPricingDto)
    @IsOptional()
    variant_pricing?: UpdateVariantPricingDto[];

    // ========== WEIGHT ==========
    @ValidateNested()
    @Type(() => UpdateWeightDto)
    @IsOptional()
    product_weight?: UpdateWeightDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateVariantWeightDto)
    @IsOptional()
    variant_weights?: UpdateVariantWeightDto[];

    // ========== STOCK ==========
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateStockInputDto)
    @IsOptional()
    stock?: UpdateStockInputDto[];
}
