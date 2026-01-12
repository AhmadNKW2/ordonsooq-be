import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus, PaymentStatus } from '../entities/order.entity';

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
  
  @IsOptional()
  @IsString()
  trackingNumber?: string;
}
