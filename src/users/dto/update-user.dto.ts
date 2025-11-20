import { IsEmail, IsString, MinLength, MaxLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
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
}