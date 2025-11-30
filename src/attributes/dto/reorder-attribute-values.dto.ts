import { IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class AttributeValueOrderItemDto {
  @IsNumber()
  id: number;

  @IsNumber()
  sort_order: number;
}

export class ReorderAttributeValuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueOrderItemDto)
  values: AttributeValueOrderItemDto[];
}
