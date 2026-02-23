import {
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  IsDateString,
  IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductStatus } from '../entities/product.entity';

export class AssignProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  product_ids: number[];
}

export enum ProductSortBy {
  CREATED_AT = 'created_at',
  UPDATED_AT = 'updated_at',
  NAME_EN = 'name_en',
  NAME_AR = 'name_ar',
  AVERAGE_RATING = 'average_rating',
  TOTAL_RATINGS = 'total_ratings',
  PRICE = 'price',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class FilterProductDto {
  // ─── Pagination ──────────────────────────────────────
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

  // ─── Sorting ─────────────────────────────────────────
  @IsOptional()
  @IsEnum(ProductSortBy)
  sortBy?: ProductSortBy = ProductSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  // ─── ID filter ───────────────────────────────────────
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return value.split(',').map(Number);
    return [Number(value)];
  })
  @IsArray()
  @IsNumber({}, { each: true })
  ids?: number[];

  // ─── Status & Visibility ─────────────────────────────
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  visible?: boolean;

  // ─── Category filter ─────────────────────────────────
  /** Single category ID (backward compat) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  categoryId?: number;

  /** Multiple category IDs (comma-separated or repeated param) */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return value.split(',').map(Number);
    return [Number(value)];
  })
  @IsArray()
  @IsNumber({}, { each: true })
  category_ids?: number[];

  // ─── Vendor filter ───────────────────────────────────
  /** Single vendor ID (backward compat) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vendorId?: number;

  /** Multiple vendor IDs */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return value.split(',').map(Number);
    return [Number(value)];
  })
  @IsArray()
  @IsNumber({}, { each: true })
  vendor_ids?: number[];

  // ─── Brand filter ────────────────────────────────────
  /** Single brand ID (backward compat) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  brandId?: number;

  /** Multiple brand IDs */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') return value.split(',').map(Number);
    return [Number(value)];
  })
  @IsArray()
  @IsNumber({}, { each: true })
  brand_ids?: number[];

  // ─── Price filter ────────────────────────────────────
  /** Minimum effective price (sale_price if set, otherwise price) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  /** Maximum effective price */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  /** Only products currently on sale (have a sale_price) */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  has_sale?: boolean;

  // ─── Rating filter ───────────────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRating?: number;

  // ─── Stock filter ────────────────────────────────────
  /** Only products that have at least 1 unit in stock */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  in_stock?: boolean;

  // ─── Date range filter ───────────────────────────────
  /** ISO date string: only products created on or after this date */
  @IsOptional()
  @IsDateString()
  start_date?: string;

  /** ISO date string: only products created on or before this date */
  @IsOptional()
  @IsDateString()
  end_date?: string;

  // ─── Text search ─────────────────────────────────────
  /** Full-text search across name, SKU, descriptions */
  @IsOptional()
  @IsString()
  search?: string;

  /** Exact SKU match */
  @IsOptional()
  @IsString()
  sku?: string;
}
