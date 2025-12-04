import { IsNotEmpty, IsNumber } from 'class-validator';

export class AddToWishlistDto {
  @IsNotEmpty()
  @IsNumber()
  product_id: number;
}
