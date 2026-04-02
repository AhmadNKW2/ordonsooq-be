import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsNumber } from 'class-validator';

export class SyncLinkedProductsDto {
  @ApiProperty({
    type: [Number],
    example: [7, 12, 18, 27],
    description:
      'The full set of product IDs that should belong to the same linked group.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  product_ids: number[];
}