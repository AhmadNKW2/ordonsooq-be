import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class AddToWishlistDto {
  @IsNotEmpty()
  @IsNumber()
  product_id: number;

  @IsOptional()
  @IsNumber()
  variant_id?: number;
}
