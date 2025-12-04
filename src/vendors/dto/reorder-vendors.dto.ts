import { IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class VendorOrderItem {
  @IsInt()
  id: number;

  @IsInt()
  @Min(0)
  sort_order: number;
}

export class ReorderVendorsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorOrderItem)
  vendors: VendorOrderItem[];
}
