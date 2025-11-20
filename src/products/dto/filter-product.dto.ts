import { IsOptional, IsNumber, Min, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum ProductSortBy {
    CREATED_AT = 'created_at',
    NAME_EN = 'name_en',
    NAME_AR = 'name_ar',
    AVERAGE_RATING = 'average_rating',
    TOTAL_RATINGS = 'total_ratings',
}

export enum SortOrder {
    ASC = 'ASC',
    DESC = 'DESC',
}

export class FilterProductDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number = 10;

    @IsOptional()
    @IsEnum(ProductSortBy)
    sortBy?: ProductSortBy = ProductSortBy.CREATED_AT;

    @IsOptional()
    @IsEnum(SortOrder)
    sortOrder?: SortOrder = SortOrder.DESC;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    categoryId?: number;

    @IsOptional()
    @Type(() => Number)
    minPrice?: number;

    @IsOptional()
    @Type(() => Number)
    maxPrice?: number;

    @IsOptional()
    @Type(() => Number)
    minRating?: number;

    @IsOptional()
    @Type(() => Number)
    maxRating?: number;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    search?: string;
}