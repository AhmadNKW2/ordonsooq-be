import {
  IsOptional,
  IsEnum,
  IsString,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CategoryStatus } from '../entities/category.entity';
import { CategorySortBy, SortOrder } from '../enums/category-filter.enum';

export class FilterCategoryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 100;

  @IsOptional()
  @IsEnum(CategorySortBy)
  sortBy?: CategorySortBy = CategorySortBy.SORT_ORDER;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;

  @IsOptional()
  @IsEnum(CategoryStatus)
  status?: CategoryStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parent_id?: number; // Filter by parent category

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  level?: number; // Filter by category level

  @IsOptional()
  @IsString()
  search?: string; // Search in name_en, name_ar, description
}
