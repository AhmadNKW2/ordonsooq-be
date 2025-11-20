import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

export class ValidateCouponDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  orderAmount: number;
}
