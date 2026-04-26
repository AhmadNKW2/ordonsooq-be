import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BrandStatus } from '../entities/brand.entity';
import {
  parseProductChangesInput,
  ProductChangesDto,
} from '../../common/dto/product-changes.dto';

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

  @ApiPropertyOptional({
    type: ProductChangesDto,
    description:
      'Delta product assignment changes. Send add/remove product IDs here instead of product_ids.',
  })
  @IsOptional()
  @Transform(({ value }) => parseProductChangesInput(value))
  @ValidateNested()
  @Type(() => ProductChangesDto)
  product_changes?: ProductChangesDto;
}
