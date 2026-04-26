import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUrl } from 'class-validator';

export class CreateCategoryUrlDto {
  @ApiProperty({
    example: 'https://vendor.example.com/monitors/gaming-monitors',
    description: 'Vendor-specific URL for this category landing page.',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    example: 9,
    description: 'Category id that this external URL belongs to.',
  })
  @Type(() => Number)
  @IsInt()
  category_id: number;

  @ApiProperty({
    example: 2,
    description: 'Vendor id that owns this category URL.',
  })
  @Type(() => Number)
  @IsInt()
  vendor_id: number;
}