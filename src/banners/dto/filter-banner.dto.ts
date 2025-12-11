import { IsOptional, IsEnum, IsBoolean, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export enum BannerSortBy {
    CREATED_AT = 'created_at',
    SORT_ORDER = 'sort_order',
}

export enum SortOrder {
    ASC = 'ASC',
    DESC = 'DESC',
}

export class FilterBannerDto {
    @IsOptional()
    @Type(() => Number)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    limit?: number = 10;

    @IsOptional()
    @IsEnum(BannerSortBy)
    sortBy?: BannerSortBy = BannerSortBy.SORT_ORDER;

    @IsOptional()
    @IsEnum(SortOrder)
    sortOrder?: SortOrder = SortOrder.ASC;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    visible?: boolean;

    @IsOptional()
    @IsString()
    search?: string; // Kept for backward compatibility, but not used since no text fields
}