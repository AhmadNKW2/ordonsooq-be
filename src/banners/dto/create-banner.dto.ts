import { IsOptional, IsBoolean, IsUrl, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { BannerLanguage } from '../entities/banner.entity';

export class CreateBannerDto {
  @IsEnum(BannerLanguage)
  @Transform(({ value }) =>
    String(value || '')
      .trim()
      .toLowerCase(),
  )
  language: BannerLanguage;

  @IsOptional()
  @IsUrl()
  @Transform(({ value }) => value?.trim() || undefined)
  link?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return true; // default to true
  })
  @IsBoolean()
  visible?: boolean;
}
