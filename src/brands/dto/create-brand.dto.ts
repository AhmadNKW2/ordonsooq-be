import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BrandStatus } from '../entities/brand.entity';

export class CreateBrandDto {
  @IsString()
  @Transform(({ value }) => (value !== undefined ? String(value) : value))
  name_en: string;

  @IsString()
  @Transform(({ value }) => (value !== undefined ? String(value) : value))
  name_ar: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value !== undefined ? String(value) : value))
  description_en?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value !== undefined ? String(value) : value))
  description_ar?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsEnum(BrandStatus)
  status?: BrandStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  visible?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value
          .split(',')
          .map(Number)
          .filter((n) => !isNaN(n));
      }
    }
    return Array.isArray(value) ? value : [];
  })
  @IsArray()
  @IsNumber({}, { each: true })
  product_ids?: number[];
}
