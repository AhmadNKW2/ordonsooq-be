import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class FilterCategoryUrlDto {
  @ApiPropertyOptional({
    example: 9,
    description: 'Filter category URLs by category id.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Filter category URLs by vendor id.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vendor_id?: number;
}