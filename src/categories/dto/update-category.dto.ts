import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';
import { IsNumber, IsOptional, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === 'null') return null;
    if (value === undefined) return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  parent_id?: number | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value
          .split(',')
          .map(Number)
          .filter((n) => !isNaN(n));
      }
    }
    return Array.isArray(value) ? value : [];
  })
  @IsArray()
  @IsNumber({}, { each: true })
  product_ids?: number[];
}
