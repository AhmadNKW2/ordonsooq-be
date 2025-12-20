import {
  IsOptional,
  IsEnum,
  IsString,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CategoryStatus } from '../entities/category.entity';

export enum CategorySortBy {
  CREATED_AT = 'createdAt',
  NAME_EN = 'name_en',
  NAME_AR = 'name_ar',
  LEVEL = 'level',
  SORT_ORDER = 'sortOrder',
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
