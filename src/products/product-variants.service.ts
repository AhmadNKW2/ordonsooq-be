import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductVariantCombination } from './entities/product-variant-combination.entity';
import { ProductStock } from './entities/product-stock.entity';
import { AttributesService } from '../attributes/attributes.service';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
    @InjectRepository(ProductVariantCombination)
    private variantCombinationRepository: Repository<ProductVariantCombination>,
    @InjectRepository(ProductStock)
    private stockRepository: Repository<ProductStock>,
    @InjectRepository(AttributeValue)
    private attributeValueRepository: Repository<AttributeValue>,
    private attributesService: AttributesService,
  ) {}

  /**
   * Add attributes to a product
   */
  async addProductAttributes(
    product_id: number,
    attributes: Array<{
      attribute_id: number;
      controls_pricing?: boolean;
      controls_media?: boolean;
      controls_weight?: boolean;
    }>,
  ): Promise<ProductAttribute[]> {
    const product = await this.productRepository.findOne({
      where: { id: product_id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    const productAttributes: ProductAttribute[] = [];

    for (const attr of attributes) {
      const existing = await this.productAttributeRepository.findOne({
        where: {
          product_id: product_id,
          attribute_id: attr.attribute_id,
        },
      });

      if (existing) {
        continue; // Skip if already exists
      }

      const productAttr = this.productAttributeRepository.create({
        product_id: product_id,
        attribute_id: attr.attribute_id,
        controls_pricing: attr.controls_pricing || false,
        controls_media: attr.controls_media || false,
        controls_weight: attr.controls_weight || false,
      });

      productAttributes.push(
        await this.productAttributeRepository.save(productAttr),
      );
    }

    return productAttributes;
  }

  /**
   * Upsert product attributes - add new or update existing
   */
  async upsertProductAttributes(
    product_id: number,
    attributes: Array<{
      attribute_id: number;
      controls_pricing?: boolean;
      controls_media?: boolean;
      controls_weight?: boolean;
    }>,
  ): Promise<ProductAttribute[]> {
    const product = await this.productRepository.findOne({
      where: { id: product_id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    const productAttributes: ProductAttribute[] = [];

    for (const attr of attributes) {
      const existing = await this.productAttributeRepository.findOne({
        where: {
          product_id: product_id,
          attribute_id: attr.attribute_id,
        },
      });

      if (existing) {
        // Update existing attribute
        existing.controls_pricing =
          attr.controls_pricing ?? existing.controls_pricing;
        existing.controls_media =
          attr.controls_media ?? existing.controls_media;
        existing.controls_weight =
          attr.controls_weight ?? existing.controls_weight;
        productAttributes.push(
          await this.productAttributeRepository.save(existing),
        );
      } else {
        // Add new attribute
        const productAttr = this.productAttributeRepository.create({
          product_id: product_id,
          attribute_id: attr.attribute_id,
          controls_pricing: attr.controls_pricing || false,
          controls_media: attr.controls_media || false,
          controls_weight: attr.controls_weight || false,
        });
        productAttributes.push(
          await this.productAttributeRepository.save(productAttr),
        );
      }
    }

    return productAttributes;
  }

  /**
   * Remove attribute from product by attribute ID
   */
  async removeProductAttributeByAttributeId(
    product_id: number,
    attributeId: number,
  ): Promise<void> {
    const productAttr = await this.productAttributeRepository.findOne({
      where: { product_id: product_id, attribute_id: attributeId },
    });

    if (!productAttr) {
      throw new NotFoundException(
        `Product attribute for product ${product_id} with attribute ID ${attributeId} not found`,
      );
    }

    await this.productAttributeRepository.remove(productAttr);
  }

  /**
   * Create a variant with its attribute value combinations
   * @param product_id - The product ID
   * @param attributeValueIds - Array of attribute value IDs that define this variant (e.g., [5, 10] for Red + Small)
   * @param skuSuffix - Optional SKU suffix for this variant
   */
  async createVariant(
    product_id: number,
    attributeValueIds: number[],
    skuSuffix?: string,
  ): Promise<ProductVariant> {
    const product = await this.productRepository.findOne({
      where: { id: product_id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    // Check if this combination already exists
    const existingVariant = await this.findVariantByCombination(
      product_id,
      attributeValueIds,
    );
    if (existingVariant) {
      throw new BadRequestException(
        'A variant with this attribute combination already exists',
      );
    }

    // Verify all attribute values exist and belong to product attributes
    for (const valueId of attributeValueIds) {
      const attributeValue = await this.attributeValueRepository.findOne({
        where: { id: valueId },
        relations: ['attribute'],
      });

      if (!attributeValue) {
        throw new NotFoundException(
          `Attribute value with ID ${valueId} not found`,
        );
      }

      const productAttr = await this.productAttributeRepository.findOne({
        where: {
          product_id: product_id,
          attribute_id: attributeValue.attribute_id,
        },
      });

      if (!productAttr) {
        throw new BadRequestException(
          `Attribute "${attributeValue.attribute.name_en}" is not associated with this product`,
        );
      }
    }

    // Create the variant
    const variant = this.variantRepository.create({
      product_id: product_id,
      is_active: true,
      combinations: attributeValueIds.map((valueId) =>
        this.variantCombinationRepository.create({
          attribute_value_id: valueId,
        }),
      ),
    });

    return await this.variantRepository.save(variant);
  }

  /**
   * Generate all possible variants for a product based on its attributes
   */
  async generateAllVariants(product_id: number): Promise<ProductVariant[]> {
    const product = await this.productRepository.findOne({
      where: { id: product_id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    // Get all product attributes with their values
    const productAttributes = await this.productAttributeRepository.find({
      where: { product_id: product_id },
      relations: ['attribute', 'attribute.values'],
    });

    if (productAttributes.length === 0) {
      return [];
    }

    // Build array of attribute values arrays
    const attributeValueArrays: AttributeValue[][] = [];
    for (const pa of productAttributes) {
      const attribute = await this.attributesService.findOne(pa.attribute_id);
      const activeValues = attribute.values.filter((v) => v.is_active);
      if (activeValues.length > 0) {
        attributeValueArrays.push(activeValues);
      }
    }

    // Generate all combinations
    const combinations = this.generateCombinations(attributeValueArrays);

    // Get existing variants
    const existingVariants = await this.variantRepository.find({
      where: { product_id: product_id },
      relations: ['combinations'],
    });

    const existingCombinationKeys = new Set(
      existingVariants.map((v) =>
        this.createCombinationKey(
          v.combinations.map((c) => c.attribute_value_id),
        ),
      ),
    );

    const newVariants: ProductVariant[] = [];

    // Create new variants for combinations that don't exist
    for (const combo of combinations) {
      const comboKey = this.createCombinationKey(combo);
      if (!existingCombinationKeys.has(comboKey)) {
        const variant = this.variantRepository.create({
          product_id: product_id,
          is_active: true,
          combinations: combo.map((valueId) =>
            this.variantCombinationRepository.create({
              attribute_value_id: valueId,
            }),
          ),
        });
        newVariants.push(await this.variantRepository.save(variant));
      }
    }

    return newVariants;
  }

  /**
   * Helper to generate all combinations from attribute values
   * Returns arrays of attribute value IDs
   */
  private generateCombinations(
    attributeValueArrays: AttributeValue[][],
  ): number[][] {
    if (attributeValueArrays.length === 0) {
      return [];
    }

    const results: number[][] = [];

    const generate = (current: number[], index: number) => {
      if (index === attributeValueArrays.length) {
        results.push([...current]);
        return;
      }

      for (const value of attributeValueArrays[index]) {
        current.push(value.id);
        generate(current, index + 1);
        current.pop();
      }
    };

    generate([], 0);
    return results;
  }

  /**
   * Create a key for comparing combinations (sorted IDs joined)
   */
  private createCombinationKey(valueIds: number[]): string {
    return [...valueIds].sort((a, b) => a - b).join(',');
  }

  /**
   * Find a variant by its attribute value combination
   */
  async findVariantByCombination(
    product_id: number,
    attributeValueIds: number[],
  ): Promise<ProductVariant | null> {
    const targetKey = this.createCombinationKey(attributeValueIds);

    const variants = await this.variantRepository.find({
      where: { product_id: product_id },
      relations: ['combinations', 'combinations.attribute_value'],
    });

    for (const variant of variants) {
      const variantKey = this.createCombinationKey(
        variant.combinations.map((c) => c.attribute_value_id),
      );
      if (variantKey === targetKey) {
        return variant;
      }
    }

    return null;
  }

  /**
   * Get all variants for a product
   */
  async getProductVariants(product_id: number): Promise<ProductVariant[]> {
    return await this.variantRepository.find({
      where: { product_id: product_id },
      relations: [
        'combinations',
        'combinations.attribute_value',
        'combinations.attribute_value.attribute',
      ],
      order: { id: 'ASC' },
    });
  }

  /**
   * Get a specific variant by ID
   */
  async getVariant(variantId: number): Promise<ProductVariant> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: [
        'combinations',
        'combinations.attribute_value',
        'combinations.attribute_value.attribute',
      ],
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    return variant;
  }

  /**
   * Update variant
   */
  async updateVariant(
    variantId: number,
    updates: { is_active?: boolean },
  ): Promise<ProductVariant> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    Object.assign(variant, updates);
    return await this.variantRepository.save(variant);
  }

  /**
   * Delete a variant
   */
  async deleteVariant(variantId: number): Promise<void> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    await this.variantRepository.remove(variant);
  }

  // ============== Stock Management ==============

  /**
   * Set stock for a simple product (no variant)
   */
  async setSimpleStock(
    product_id: number,
    quantity?: number,
    is_out_of_stock?: boolean,
  ): Promise<ProductStock> {
    const product = await this.productRepository.findOne({
      where: { id: product_id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    let stock = await this.stockRepository.findOne({
      where: { product_id: product_id, variant_id: IsNull() },
    });

    if (stock) {
      if (quantity !== undefined) stock.quantity = quantity;
      if (is_out_of_stock !== undefined) stock.is_out_of_stock = is_out_of_stock;
    } else {
      stock = this.stockRepository.create({
        product_id: product_id,
        variant_id: null,
        quantity: quantity ?? 0,
        is_out_of_stock: is_out_of_stock ?? false,
      });
    }

    return await this.stockRepository.save(stock);
  }

  /**
   * Set stock for a specific variant
   */
  async setVariantStock(
    product_id: number,
    variantId: number,
    quantity: number,
  ): Promise<ProductStock> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId, product_id: product_id },
    });

    if (!variant) {
      throw new NotFoundException(
        `Variant with ID ${variantId} not found for product ${product_id}`,
      );
    }

    let stock = await this.stockRepository.findOne({
      where: { product_id: product_id, variant_id: variantId },
    });

    if (stock) {
      stock.quantity = quantity;
    } else {
      stock = this.stockRepository.create({
        product_id: product_id,
        variant_id: variantId,
        quantity,
      });
    }

    return await this.stockRepository.save(stock);
  }

  /**
   * Set stock by attribute combination
   * Finds or creates the variant matching the combination, then sets its stock
   */
  async setStockByCombination(
    product_id: number,
    combination: Record<string, number>,
    quantity: number,
  ): Promise<ProductStock> {
    const product = await this.productRepository.findOne({
      where: { id: product_id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    // Get attribute value IDs from combination
    const attributeValueIds = Object.values(combination);

    // Find existing variant with this combination
    let variant = await this.findVariantByCombination(
      product_id,
      attributeValueIds,
    );

    // If no variant exists, create one
    if (!variant) {
      variant = await this.createVariant(product_id, attributeValueIds);
    }

    // Set stock for this variant
    return await this.setVariantStock(product_id, variant.id, quantity);
  }

  /**
   * Get simple stock for a product (variant_id is NULL)
   */
  async getSimpleStock(product_id: number): Promise<ProductStock | null> {
    return await this.stockRepository.findOne({
      where: { product_id: product_id, variant_id: IsNull() },
    });
  }

  /**
   * Get stock for a specific variant
   */
  async getVariantStock(
    product_id: number,
    variantId: number,
  ): Promise<ProductStock | null> {
    return await this.stockRepository.findOne({
      where: { product_id: product_id, variant_id: variantId },
      relations: [
        'variant',
        'variant.combinations',
        'variant.combinations.attribute_value',
      ],
    });
  }

  /**
   * Get all stock for a product (both simple and variant)
   */
  async getAllStock(product_id: number): Promise<ProductStock[]> {
    return await this.stockRepository.find({
      where: { product_id: product_id },
      relations: [
        'variant',
        'variant.combinations',
        'variant.combinations.attribute_value',
      ],
      order: { id: 'ASC' },
    });
  }

  /**
   * Deduct stock for a variant
   */
  async deductStock(
    product_id: number,
    variantId: number | null,
    quantity: number,
  ): Promise<ProductStock> {
    const whereCondition = variantId
      ? { product_id: product_id, variant_id: variantId }
      : { product_id: product_id, variant_id: IsNull() };

    const stock = await this.stockRepository.findOne({
      where: whereCondition as any,
    });

    if (!stock) {
      throw new NotFoundException(
        variantId
          ? `Stock not found for variant ${variantId}`
          : `Stock not found for product ${product_id}`,
      );
    }

    if (stock.quantity < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${stock.quantity}, Requested: ${quantity}`,
      );
    }

    stock.quantity -= quantity;
    return await this.stockRepository.save(stock);
  }

  /**
   * Check if stock is available
   */
  async checkStock(
    product_id: number,
    variantId: number | null,
  ): Promise<{ available: boolean; quantity: number }> {
    const whereCondition = variantId
      ? { product_id: product_id, variant_id: variantId }
      : { product_id: product_id, variant_id: IsNull() };

    const stock = await this.stockRepository.findOne({
      where: whereCondition as any,
    });

    return {
      available: stock ? stock.quantity > 0 : false,
      quantity: stock ? stock.quantity : 0,
    };
  }

  // ============== Product Attributes ==============

  /**
   * Update attribute control flags
   */
  async updateProductAttribute(
    productAttributeId: number,
    updates: {
      controls_pricing?: boolean;
      controls_media?: boolean;
      controls_weight?: boolean;
    },
  ): Promise<ProductAttribute> {
    const productAttr = await this.productAttributeRepository.findOne({
      where: { id: productAttributeId },
    });

    if (!productAttr) {
      throw new NotFoundException(
        `Product attribute with ID ${productAttributeId} not found`,
      );
    }

    Object.assign(productAttr, updates);
    return await this.productAttributeRepository.save(productAttr);
  }

  /**
   * Update attribute control flags by product ID and attribute ID
   */
  async updateProductAttributeByAttributeId(
    product_id: number,
    attributeId: number,
    updates: {
      controls_pricing?: boolean;
      controls_media?: boolean;
      controls_weight?: boolean;
    },
  ): Promise<ProductAttribute> {
    const productAttr = await this.productAttributeRepository.findOne({
      where: { product_id: product_id, attribute_id: attributeId },
    });

    if (!productAttr) {
      throw new NotFoundException(
        `Product attribute for product ${product_id} with attribute ID ${attributeId} not found`,
      );
    }

    Object.assign(productAttr, updates);
    return await this.productAttributeRepository.save(productAttr);
  }

  /**
   * Remove attribute from product
   */
  async removeProductAttribute(productAttributeId: number): Promise<void> {
    const productAttr = await this.productAttributeRepository.findOne({
      where: { id: productAttributeId },
    });

    if (!productAttr) {
      throw new NotFoundException(
        `Product attribute with ID ${productAttributeId} not found`,
      );
    }

    await this.productAttributeRepository.remove(productAttr);
  }

  /**
   * Get product attributes
   */
  async getProductAttributes(product_id: number): Promise<ProductAttribute[]> {
    return await this.productAttributeRepository.find({
      where: { product_id: product_id },
      relations: ['attribute', 'attribute.values'],
    });
  }

  /**
   * Delete all attributes for a product
   */
  async deleteAllAttributesForProduct(product_id: number): Promise<void> {
    await this.productAttributeRepository.delete({ product_id: product_id });
  }

  /**
   * Delete all variants for a product
   */
  async deleteAllVariantsForProduct(product_id: number): Promise<void> {
    await this.variantRepository.delete({ product_id: product_id });
  }

  /**
   * Bulk create stocks
   * This assumes all previous stocks have been deleted
   */
  async bulkCreateStocks(
    product_id: number,
    items: Array<{
      combination?: Record<string, number>;
      quantity?: number;
      is_out_of_stock?: boolean;
    }>,
  ): Promise<void> {
    if (items.length === 0) return;

    // For stocks, we need to resolve variant IDs for combinations
    // This is tricky because variants might not exist yet if we just created attributes
    // However, in the current flow, we don't explicitly create variants, they are derived or created on demand?
    // Wait, ProductVariant entity exists.
    // Let's look at setStockByCombination to see how it handles variants.

    // It calls findOrCreateVariant.
    // So we need to bulk findOrCreateVariant first? That's complex.
    // Or we can just use the existing parallel logic for stocks if variants are involved.
    // But if we can optimize simple stocks (no combination), that's easy.

    const simpleStocks = items.filter(
      (i) => !i.combination || Object.keys(i.combination).length === 0,
    );
    const combinationStocks = items.filter(
      (i) => i.combination && Object.keys(i.combination).length > 0,
    );

    // Bulk insert simple stocks
    if (simpleStocks.length > 0) {
      const stocks = simpleStocks.map((item) =>
        this.stockRepository.create({
          product_id: product_id,
          variant_id: null,
          quantity: item.quantity ?? 0,
          is_out_of_stock: item.is_out_of_stock ?? false,
        }),
      );
      await this.stockRepository.save(stocks);
    }

    // For combination stocks, we still need to resolve variants.
    // If we can't easily bulk resolve variants, we might have to stick to parallel processing for them.
    // But we can at least parallelize the variant resolution and then bulk insert the stocks.

    if (combinationStocks.length > 0) {
      // We'll stick to the existing parallel method for combination stocks for now
      // as it involves complex variant creation logic.
      await Promise.all(
        combinationStocks.map((item) =>
          this.setStockByCombination(
            product_id,
            item.combination!,
            item.quantity ?? 0,
          ),
        ),
      );
    }
  }

  /**
   * Delete all stocks for a product
   */
  async deleteAllStocksForProduct(product_id: number): Promise<void> {
    await this.stockRepository.delete({ product_id: product_id });
  }
}
