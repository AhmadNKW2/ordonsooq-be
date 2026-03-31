import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateSpecificationValueDto {
  @IsOptional()
  @IsString()
  value_en?: string;

  @IsOptional()
  @IsString()
  value_ar?: string;

  @IsOptional()
  @IsInt()
  parent_value_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
