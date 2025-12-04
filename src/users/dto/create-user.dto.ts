import { IsEmail, IsString, MinLength, MaxLength, IsEnum, IsOptional, IsArray, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    firstName: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    lastName: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole; // Optional, defaults to USER

    @IsArray()
    @IsOptional()
    @Type(() => Number)
    @IsNumber({}, { each: true })
    product_ids?: number[]; // Products to add to user's wishlist
}