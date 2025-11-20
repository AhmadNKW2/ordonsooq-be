import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class CreateCategoryDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    image?: string;

    @IsNumber()
    @IsOptional()
    parentId?: number; // For creating subcategories

    // image will be handled separately in multipart/form-data
}