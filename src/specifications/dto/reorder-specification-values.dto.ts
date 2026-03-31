import { IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class SpecificationValueOrderItemDto {
  @IsNumber()
  id: number;

  @IsNumber()
  sort_order: number;
}

export class ReorderSpecificationValuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecificationValueOrderItemDto)
  values: SpecificationValueOrderItemDto[];
}
