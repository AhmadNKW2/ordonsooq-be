import { IsNumber, IsOptional, Min } from 'class-validator';

export class SetPricingDto {
  @IsNumber()
  @Min(0)
  cost: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  sale_price?: number;
}

export class SetVariantPricingDto extends SetPricingDto {
  @IsNumber()
  attribute_value_id: number;
}
