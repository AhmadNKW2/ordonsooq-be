import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateSpecificationDto, SpecificationValueDto } from './create-specification.dto';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSpecificationValueItemDto extends PartialType(
  SpecificationValueDto,
) {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class UpdateSpecificationDto extends PartialType(
  OmitType(CreateSpecificationDto, ['values'] as const),
) {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSpecificationValueItemDto)
  values?: UpdateSpecificationValueItemDto[];
}
