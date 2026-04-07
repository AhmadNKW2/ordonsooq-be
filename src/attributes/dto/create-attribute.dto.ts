import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsHexColor,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AttributeValueDto {
  @IsString()
  @IsNotEmpty()
  value_en: string;

  @IsString()
  @IsNotEmpty()
  value_ar: string;

  @IsOptional()
  @IsHexColor()
  color_code?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsInt()
  parent_value_id?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class CreateAttributeDto {
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
  is_color?: boolean;

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
    description: 'Category IDs that this attribute can be used with.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  category_ids?: number[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  @IsOptional()
  values?: AttributeValueDto[];
}
