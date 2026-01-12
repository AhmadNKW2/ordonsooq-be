import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  title: string;

  @IsString()
  addressLine1: string;

  @IsString()
  @IsOptional()
  addressLine2?: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  country: string;

  @IsString()
  zipCode: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
