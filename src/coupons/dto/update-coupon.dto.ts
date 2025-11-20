import { PartialType } from '@nestjs/mapped-types';
import { CreateCouponDto } from './create-coupon.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { CouponStatus } from '../entities/coupon.entity';

export class UpdateCouponDto extends PartialType(CreateCouponDto) {
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;
}
