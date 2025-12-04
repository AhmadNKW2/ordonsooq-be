import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';
import { IsNumber, IsOptional, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  })
  parent_id?: number;

  @IsArray()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',').map(Number).filter(n => !isNaN(n));
      }
    }
    return value;
  })
  product_ids?: number[];
}