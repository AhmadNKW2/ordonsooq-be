import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashbackType } from '../entities/cashback-rule.entity';

export class CreateCashbackRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CashbackType)
  @IsNotEmpty()
  type: CashbackType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrderAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxCashbackAmount?: number;

  @IsOptional()
  isActive?: boolean;
}
