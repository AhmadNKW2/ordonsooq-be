import { IsOptional, IsEnum, IsString, IsNumber, Min } from 'class-validator';
import { CouponType, CouponStatus } from '../entities/coupon.entity';
import { Type } from 'class-transformer';

export enum CouponSortBy {
  CREATED_AT = 'createdAt',
  CODE = 'code',
  VALUE = 'value',
  USAGE_COUNT = 'usageCount',
  VALID_UNTIL = 'validUntil',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class FilterCouponDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(CouponSortBy)
  sortBy?: CouponSortBy = CouponSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @IsOptional()
  @IsString()
  search?: string; // Search in code, description

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxValue?: number;
}
