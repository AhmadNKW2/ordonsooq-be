import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SpecificationValueDto {
  @IsString()
  @IsNotEmpty()
  value_en: string;

  @IsString()
  @IsNotEmpty()
  value_ar: string;

  @IsOptional()
  @IsInt()
  parent_value_id?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class CreateSpecificationDto {
  @IsString()
  @IsNotEmpty()
  name_en: string;

  @IsString()
  @IsNotEmpty()
  name_ar: string;

  @IsString()
  @IsOptional()
  unit_en?: string;

  @IsString()
  @IsOptional()
  unit_ar?: string;

  @IsOptional()
  @IsInt()
  parent_id?: number;

  @IsOptional()
  @IsInt()
  parent_value_id?: number;

  @IsBoolean()
  @IsOptional()
  list_separately?: boolean;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  attribute_type?: string;

  @ApiPropertyOptional({
    type: [Number],
    example: [5, 12],
    description: 'Category IDs that this specification can be used with.',
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  category_ids?: number[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecificationValueDto)
  @IsOptional()
  values?: SpecificationValueDto[];
}
