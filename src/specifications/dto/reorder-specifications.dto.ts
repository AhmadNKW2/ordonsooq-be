import { IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class SpecificationOrderItemDto {
  @IsNumber()
  id: number;

  @IsNumber()
  sort_order: number;
}

export class ReorderSpecificationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecificationOrderItemDto)
  specifications: SpecificationOrderItemDto[];
}
