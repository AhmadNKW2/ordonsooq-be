import { PartialType } from '@nestjs/mapped-types';
import { CreateVendorDto } from './create-vendor.dto';
import { IsArray, IsNumber, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {
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
