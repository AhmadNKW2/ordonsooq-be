import { PartialType } from '@nestjs/mapped-types';
import { CreateCashbackRuleDto } from './create-cashback-rule.dto';

export class UpdateCashbackRuleDto extends PartialType(CreateCashbackRuleDto) {}
