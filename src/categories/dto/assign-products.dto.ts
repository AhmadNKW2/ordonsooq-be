import { IsArray, ArrayMinSize, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignProductsToCategoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  product_ids: number[];
}
