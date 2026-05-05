import { PartialType } from '@nestjs/mapped-types';
import { CreateVendorCategoryDto } from './create-vendor-category.dto';

export class UpdateVendorCategoryDto extends PartialType(
  CreateVendorCategoryDto,
) {}