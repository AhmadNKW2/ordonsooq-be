import { IsEmail, IsString, MinLength, MaxLength, IsEnum, IsOptional, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    @IsOptional()
    firstName?: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    @IsOptional()
    lastName?: string;

    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole; // Can update role here

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @IsArray()
    @IsOptional()
    @Type(() => Number)
    @IsNumber({}, { each: true })
    product_ids?: number[]; // Products to sync to user's wishlist (replaces existing)
}