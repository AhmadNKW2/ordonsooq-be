import { IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class AddToCartDto {
  @IsNotEmpty()
  @IsNumber()
  product_id: number;

  @IsOptional()
  @IsNumber()
  variant_id?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
