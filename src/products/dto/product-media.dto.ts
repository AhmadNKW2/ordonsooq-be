import { IsNumber, IsEnum, IsBoolean, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { MediaType } from '../../media/entities/media.entity';

export class AddMediaDto {
  @IsEnum(MediaType)
  type: MediaType;

  @Transform(({ value }) => (value ? Number(value) : 0))
  @IsNumber()
  @Min(0)
  @IsOptional()
  sort_order?: number;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}

export class AddVariantMediaDto extends AddMediaDto {
  @IsNumber()
  attribute_value_id: number;
}
