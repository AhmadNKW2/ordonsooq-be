import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCountryWorldDto {
  @IsString()
  @IsNotEmpty()
  name_en: string;

  @IsString()
  @IsNotEmpty()
  name_ar: string;

  @IsString()
  @IsNotEmpty()
  image_url: string;
}
