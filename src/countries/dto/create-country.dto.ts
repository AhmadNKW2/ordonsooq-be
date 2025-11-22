import { IsNumber, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CountryAttributeDto {
  @IsNumber()
  @IsNotEmpty()
  attributeId: number;

  @IsString()
  @IsNotEmpty()
  value_en: string;

  @IsString()
  @IsNotEmpty()
  value_ar: string;
}

export class CreateCountryDto {
  @IsNumber()
  @IsNotEmpty()
  countryWorldId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountryAttributeDto)
  @IsOptional()
  attributes?: CountryAttributeDto[];
}
