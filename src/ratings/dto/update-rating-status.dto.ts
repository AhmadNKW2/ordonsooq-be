import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RatingStatus } from '../entities/rating.entity';

export class UpdateRatingStatusDto {
  @IsEnum(RatingStatus)
  status: RatingStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
