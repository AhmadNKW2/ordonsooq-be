import { PartialType } from '@nestjs/mapped-types';
import { UpdateProductDto } from './update-product.dto';

export class PatchProductDto extends PartialType(UpdateProductDto) {}
