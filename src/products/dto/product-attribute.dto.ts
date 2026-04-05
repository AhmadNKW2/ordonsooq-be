import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductAttributeInputDto {
  @ApiProperty({
    example: 21,
    description: 'Attribute id, for example Color or Size.',
  })
  @IsNumber()
  @Type(() => Number)
  attribute_id: number;

  @ApiProperty({
    type: [Number],
    example: [81, 82],
    description: 'One or more attribute value ids that belong to the provided attribute.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  attribute_value_ids: number[];
}

