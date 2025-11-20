import { IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { TransactionType, TransactionSource } from '../entities/wallet-transaction.entity';
import { Type } from 'class-transformer';

export enum TransactionSortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class FilterTransactionDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(TransactionSortBy)
  sortBy?: TransactionSortBy = TransactionSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;
}
