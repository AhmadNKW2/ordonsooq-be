import { IsInt, IsNotEmpty, IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateNoteDto {
  @IsInt()
  @IsNotEmpty()
  product_id: number;

  @IsString()
  @IsNotEmpty()
  notes: string;

  @IsString()
  @IsOptional()
  guest_name?: string;

  @IsString()
  @IsOptional()
  guest_phone?: string;

  @IsEmail()
  @IsOptional()
  guest_email?: string;
}
