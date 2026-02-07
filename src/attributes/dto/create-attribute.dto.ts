import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsHexColor,
  IsInt,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  is_active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  @IsOptional()
  values?: AttributeValueDto[];
}
