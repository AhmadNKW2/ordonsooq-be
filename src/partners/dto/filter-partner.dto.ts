import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum PartnerSortBy {
  CREATED_AT = 'created_at',
  FULL_NAME = 'full_name',
  COMPANY_NAME = 'company_name',
}

export enum PartnerSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class FilterPartnerDto {
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
  @IsEnum(PartnerSortBy)
  sortBy?: PartnerSortBy = PartnerSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(PartnerSortOrder)
  sortOrder?: PartnerSortOrder = PartnerSortOrder.DESC;

  @IsOptional()
  @IsString()
  search?: string;
}