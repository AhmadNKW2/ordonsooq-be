import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAttributeDto, AttributeValueDto } from './create-attribute.dto';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAttributeValueItemDto extends PartialType(AttributeValueDto) {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class UpdateAttributeDto extends PartialType(
  OmitType(CreateAttributeDto, ['values'] as const),
) {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAttributeValueItemDto)
  values?: UpdateAttributeValueItemDto[];
}
