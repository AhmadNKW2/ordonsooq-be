import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttributeValueDto {
  @IsString()
  @IsNotEmpty()
  value_en: string;

  @IsString()
  @IsNotEmpty()
  value_ar: string;

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

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  @IsOptional()
  values?: AttributeValueDto[];
}
