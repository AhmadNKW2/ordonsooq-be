import { IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class RestoreProductDto {
  @IsOptional()
  @IsNumber()
  newCategoryId?: number; // Required if original category is archived
}
