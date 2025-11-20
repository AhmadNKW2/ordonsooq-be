import { IsNumber, IsOptional, Min } from 'class-validator';

export class SetWeightDto {
  @IsNumber()
  @Min(0)
  weight: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  length?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  width?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  height?: number;
}

export class SetVariantWeightDto extends SetWeightDto {
  @IsNumber()
  attribute_value_id: number;
}
