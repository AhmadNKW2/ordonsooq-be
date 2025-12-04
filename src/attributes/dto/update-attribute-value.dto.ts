import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateAttributeValueDto {
  @IsOptional()
  @IsString()
  value_en?: string;

  @IsOptional()
  @IsString()
  value_ar?: string;

  @IsOptional()
  @IsString()
  color_code?: string | null;

  @IsOptional()
  @IsString()
  image_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
