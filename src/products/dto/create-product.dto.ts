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

// Product attribute DTO for complete creation
class ProductAttributeInput {
    @IsNumber()
    attribute_id: number;

    @IsBoolean()
    controls_pricing: boolean;

    @IsBoolean()
    controls_media: boolean;

    @IsBoolean()
    controls_weight: boolean;
}

// Pricing DTO
class SinglePricingInput {
    @IsNumber()
    cost: number;

    @IsNumber()
    price: number;

    @IsNumber()
    @IsOptional()
    sale_price?: number;
}

class VariantPricingInput {
    @IsObject()
    combination: Record<string, number>; // { "Color": 1, "Size": 3 }

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

class VariantWeightInput {
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

// Stock DTO
class StockInput {
    @IsObject()
    combination: Record<string, number>;

    @IsNumber()
    stock_quantity: number;
}

// Main DTO for product creation
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

    // Attributes
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductAttributeInput)
    @IsOptional()
    attributes?: ProductAttributeInput[];

    // Pricing
    @ValidateNested()
    @Type(() => SinglePricingInput)
    @IsOptional()
    single_pricing?: SinglePricingInput;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariantPricingInput)
    @IsOptional()
    variant_pricing?: VariantPricingInput[];

    // Weight
    @ValidateNested()
    @Type(() => WeightInput)
    @IsOptional()
    product_weight?: WeightInput;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariantWeightInput)
    @IsOptional()
    variant_weights?: VariantWeightInput[];

    // Stock
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => StockInput)
    @IsOptional()
    stock?: StockInput[];
}
