import { IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class CategoryOrderItem {
  @IsInt()
  id: number;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryOrderItem)
  categories: CategoryOrderItem[];
}
