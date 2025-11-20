import { IsOptional, IsEnum, IsString, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export enum CategorySortBy {
  CREATED_AT = 'createdAt',
  NAME = 'name',
  LEVEL = 'level',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class FilterCategoryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(CategorySortBy)
  sortBy?: CategorySortBy = CategorySortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parentId?: number; // Filter by parent category

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  level?: number; // Filter by category level

  @IsOptional()
  @IsString()
  search?: string; // Search in name, description
}
