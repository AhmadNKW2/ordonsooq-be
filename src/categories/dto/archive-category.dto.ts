import { IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Options for restoring products within a category
 */
export class RestoreProductsOptions {
  @IsOptional()
  @IsBoolean()
  restoreAll?: boolean; // Restore all archived products

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  product_ids?: number[]; // Select specific product IDs to restore
}

/**
 * Options for restoring a subcategory with its products and nested subcategories
 */
export class RestoreSubcategoryOptions {
  @IsNumber()
  id: number; // Subcategory ID

  @IsOptional()
  @ValidateNested()
  @Type(() => RestoreProductsOptions)
  products?: RestoreProductsOptions; // How to restore products in this subcategory

  @IsOptional()
  @IsBoolean()
  restoreAllSubcategories?: boolean; // Restore all nested subcategories

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestoreSubcategoryOptions)
  subcategories?: RestoreSubcategoryOptions[]; // Select specific subcategories with their options
}

export class RestoreCategoryDto {
  // Parent handling options
  @IsOptional()
  @IsNumber()
  new_parent_id?: number; // If moving to a different parent

  @IsOptional()
  @IsBoolean()
  makeRoot?: boolean; // Make this a root category (no parent)

  // Product restoration options for this category
  @IsOptional()
  @ValidateNested()
  @Type(() => RestoreProductsOptions)
  products?: RestoreProductsOptions;

  // Subcategory restoration options
  @IsOptional()
  @IsBoolean()
  restoreAllSubcategories?: boolean; // Restore ALL descendant categories with ALL their products

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestoreSubcategoryOptions)
  subcategories?: RestoreSubcategoryOptions[]; // Select specific subcategories with granular options

  // Legacy support - simple boolean for backward compatibility
  @IsOptional()
  @IsBoolean()
  restoreAllContents?: boolean; // Deprecated: Use restoreAllSubcategories + products.restoreAll instead
}

export class PermanentDeleteCategoryDto {
  @IsOptional()
  @IsBoolean()
  deleteProducts?: boolean; // Permanently delete all archived products in this category

  @IsOptional()
  @IsNumber()
  move_products_to_category_id?: number; // Move products to a specific category before deleting
}
