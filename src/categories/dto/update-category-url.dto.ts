import { PartialType } from '@nestjs/swagger';
import { CreateCategoryUrlDto } from './create-category-url.dto';

export class UpdateCategoryUrlDto extends PartialType(CreateCategoryUrlDto) {}