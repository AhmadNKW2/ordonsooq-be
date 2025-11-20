import { IsNotEmpty, IsNumber, Min, IsEnum, IsOptional, IsString } from 'class-validator';
import { TransactionSource } from '../entities/wallet-transaction.entity';

export class AddFundsDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(TransactionSource)
  source: TransactionSource;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}
