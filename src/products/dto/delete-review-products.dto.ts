import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class DeleteReviewProductsDto {
  @ApiProperty({
    example: 35,
    description: 'Category ID used to match review products for permanent deletion',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  category_id: number;

  @ApiProperty({
    example: 2,
    description: 'Vendor ID used to match review products for permanent deletion',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendor_id: number;
}