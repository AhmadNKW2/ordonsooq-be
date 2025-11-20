import { IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class AddProductAttributeDto {
  @IsNumber()
  attribute_id: number;

  @IsBoolean()
  @IsOptional()
  controls_pricing?: boolean;

  @IsBoolean()
  @IsOptional()
  controls_media?: boolean;

  @IsBoolean()
  @IsOptional()
  controls_weight?: boolean;
}

export class UpdateProductAttributeDto {
  @IsBoolean()
  @IsOptional()
  controls_pricing?: boolean;

  @IsBoolean()
  @IsOptional()
  controls_media?: boolean;

  @IsBoolean()
  @IsOptional()
  controls_weight?: boolean;
}
