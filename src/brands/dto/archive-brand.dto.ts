import { IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';

export class RestoreBrandDto {
  @IsOptional()
  @IsBoolean()
  restoreAllProducts?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  product_ids?: number[];
}

export class PermanentDeleteBrandDto {
  @IsOptional()
  @IsBoolean()
  deleteProducts?: boolean;

  @IsOptional()
  @IsNumber()
  moveProductsToBrandId?: number;
}
