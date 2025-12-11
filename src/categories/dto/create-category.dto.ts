import { IsString, IsOptional, IsNumber, MaxLength, IsBoolean, IsEnum, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CategoryStatus } from '../entities/category.entity';

export class CreateCategoryDto {
    @IsString()
    @MaxLength(100)
    name_en: string;

    @IsString()
    @MaxLength(100)
    name_ar: string;

    @IsString()
    @IsOptional()
    description_en?: string;

    @IsString()
    @IsOptional()
    description_ar?: string;

    @IsString()
    @IsOptional()
    image?: string;

    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => {
        if (value === '' || value === null || value === undefined) return undefined;
        const num = Number(value);
        return isNaN(num) ? undefined : num;
    })
    parent_id?: number; // For creating subcategories (omit or null for root category)

    @IsEnum(CategoryStatus)
    @IsOptional()
    @Transform(({ value }) => value === '' ? undefined : value)
    status?: CategoryStatus;

    @IsBoolean()
    @IsOptional()
    @Transform(({ value }) => {
        if (value === '' || value === undefined) return undefined;
        if (value === 'true' || value === true) return true;
        if (value === 'false' || value === false) return false;
        return undefined;
    })
    visible?: boolean;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === '' || value === undefined || value === null) return [];
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return value.split(',').map(Number).filter(n => !isNaN(n));
            }
        }
        return Array.isArray(value) ? value : [];
    })
    @IsArray()
    @IsNumber({}, { each: true })
    product_ids?: number[];

    // image will be handled separately in multipart/form-data
}