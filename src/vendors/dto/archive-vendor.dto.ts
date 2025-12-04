import { IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';

export class RestoreVendorDto {
  @IsOptional()
  @IsBoolean()
  restoreAllProducts?: boolean; // Restore all archived products from this vendor

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  product_ids?: number[]; // Select specific product IDs to restore
}

export class PermanentDeleteVendorDto {
  @IsOptional()
  @IsBoolean()
  deleteProducts?: boolean; // Permanently delete all archived products from this vendor

  @IsOptional()
  @IsNumber()
  moveProductsToVendorId?: number; // Move products to a specific vendor before deleting
}
