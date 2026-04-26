import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'product_ids'] as const),
) {
  @ApiPropertyOptional({
    example: true,
    description: 'Whether the user account is active.',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [Number],
    example: [101, 205],
    description:
      'Product ids to sync to the user wishlist. Pass an empty array to clear it.',
  })
  @IsArray()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  product_ids?: number[]; // Products to sync to user's wishlist (replaces existing)
}
