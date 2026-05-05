import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUrl, Min } from 'class-validator';

export class CreateCategoryUrlDto {
  @ApiProperty({
    example: 'https://store.example.com/monitors/gaming-monitors',
    description:
      'URL for this category landing page. Multiple URLs are allowed for the same category.',
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

  @ApiPropertyOptional({
    example: 0,
    description:
      'Optional display order for this URL within the same category. If omitted, it is appended to the end.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}