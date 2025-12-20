import {
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
} from 'class-validator';

export class CreateRatingDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsNotEmpty()
  @IsNumber()
  product_id: number;
}
