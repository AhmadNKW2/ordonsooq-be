import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class HomeProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  topRatedLimit?: number = 8;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  newestLimit?: number = 8;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  variantCards?: boolean = true;
}
