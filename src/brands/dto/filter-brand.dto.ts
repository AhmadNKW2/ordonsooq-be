import { IsOptional, IsEnum, IsBoolean, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { BrandStatus } from '../entities/brand.entity';

export enum BrandSortBy {
  CREATED_AT = 'created_at',
  NAME_EN = 'name_en',
  NAME_AR = 'name_ar',
  SORT_ORDER = 'sort_order',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class FilterBrandDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(BrandSortBy)
  sortBy?: BrandSortBy = BrandSortBy.SORT_ORDER;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;

  @IsOptional()
  @IsEnum(BrandStatus)
  status?: BrandStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
