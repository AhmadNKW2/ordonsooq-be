import { IsOptional, IsBoolean, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBannerDto {
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