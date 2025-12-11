import { IsArray, ArrayMinSize, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderBannersDto {
    @IsArray()
    @ArrayMinSize(1)
    @Type(() => Number)
    @IsNumber({}, { each: true })
    banner_ids: number[];
}