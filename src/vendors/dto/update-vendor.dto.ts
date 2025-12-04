import { PartialType } from '@nestjs/mapped-types';
import { CreateVendorDto } from './create-vendor.dto';
import { IsArray, IsNumber, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {
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
