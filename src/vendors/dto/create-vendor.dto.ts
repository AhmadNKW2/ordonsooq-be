import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, IsEnum, IsArray, IsNumber } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { VendorStatus } from '../entities/vendor.entity';

export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  name_en: string;

  @IsString()
  @IsNotEmpty()
  name_ar: string;

  @IsString()
  @IsOptional()
  description_en?: string;

  @IsString()
  @IsOptional()
  description_ar?: string;

  @IsEmail()
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsEnum(VendorStatus)
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  status?: VendorStatus;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  visible?: boolean;

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

  // Logo will be handled as file upload
}
