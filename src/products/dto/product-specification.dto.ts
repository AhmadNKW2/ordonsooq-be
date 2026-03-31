import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductSpecificationInputDto {
  @ApiProperty({
    example: 11,
    description: 'Specification id, for example Display Type.',
  })
  @IsNumber()
  @Type(() => Number)
  specification_id: number;

  @ApiProperty({
    type: [Number],
    example: [67],
    description:
      'One or more specification value ids that belong to the provided specification.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  specification_value_ids: number[];
}