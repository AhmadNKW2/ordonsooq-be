import { IsArray, IsNumber, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemCostEntry {
  @IsNumber()
  itemId: number;

  @IsNumber()
  @Min(0)
  cost: number;
}

export class UpdateOrderItemsCostDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemCostEntry)
  items: OrderItemCostEntry[];
}
