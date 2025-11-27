import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Product, PricingType } from './entities/product.entity';
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
    productId: number,
    attributes: Array<{
      attribute_id: number;
      controls_pricing?: boolean;
      controls_media?: boolean;
      controls_weight?: boolean;
    }>,
  ): Promise<ProductAttribute[]> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.pricing_type !== PricingType.VARIANT && attributes.length > 0) {
      throw new BadRequestException(
        'Product must have pricing_type = "variant" to add attributes',
      );
    }

    const productAttributes: ProductAttribute[] = [];

    for (const attr of attributes) {
      const existing = await this.productAttributeRepository.findOne({
        where: {
          product_id: productId,
          attribute_id: attr.attribute_id,
        },
      });

      if (existing) {
        continue; // Skip if already exists
      }

      const productAttr = this.productAttributeRepository.create({
        product_id: productId,
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
   * Create a variant with its attribute value combinations
   * @param productId - The product ID
   * @param attributeValueIds - Array of attribute value IDs that define this variant (e.g., [5, 10] for Red + Small)
   * @param skuSuffix - Optional SKU suffix for this variant
   */
  async createVariant(
    productId: number,
    attributeValueIds: number[],
    skuSuffix?: string,
  ): Promise<ProductVariant> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.pricing_type !== PricingType.VARIANT) {
      throw new BadRequestException(
        'Product must have pricing_type = "variant" to create variants',
      );
    }

    // Check if this combination already exists
    const existingVariant = await this.findVariantByCombination(productId, attributeValueIds);
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
        throw new NotFoundException(`Attribute value with ID ${valueId} not found`);
      }

      const productAttr = await this.productAttributeRepository.findOne({
        where: {
          product_id: productId,
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
      product_id: productId,
      sku_suffix: skuSuffix,
      is_active: true,
      combinations: attributeValueIds.map((valueId) =>
        this.variantCombinationRepository.create({ attribute_value_id: valueId }),
      ),
    });

    return await this.variantRepository.save(variant);
  }

  /**
   * Generate all possible variants for a product based on its attributes
   */
  async generateAllVariants(productId: number): Promise<ProductVariant[]> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.pricing_type !== PricingType.VARIANT) {
      throw new BadRequestException(
        'Product must have pricing_type = "variant" to generate variants',
      );
    }

    // Get all product attributes with their values
    const productAttributes = await this.productAttributeRepository.find({
      where: { product_id: productId },
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
      where: { product_id: productId },
      relations: ['combinations'],
    });

    const existingCombinationKeys = new Set(
      existingVariants.map((v) =>
        this.createCombinationKey(v.combinations.map((c) => c.attribute_value_id)),
      ),
    );

    const newVariants: ProductVariant[] = [];

    // Create new variants for combinations that don't exist
    for (const combo of combinations) {
      const comboKey = this.createCombinationKey(combo);
      if (!existingCombinationKeys.has(comboKey)) {
        const variant = this.variantRepository.create({
          product_id: productId,
          is_active: true,
          combinations: combo.map((valueId) =>
            this.variantCombinationRepository.create({ attribute_value_id: valueId }),
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
    productId: number,
    attributeValueIds: number[],
  ): Promise<ProductVariant | null> {
    const targetKey = this.createCombinationKey(attributeValueIds);

    const variants = await this.variantRepository.find({
      where: { product_id: productId },
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
  async getProductVariants(productId: number): Promise<ProductVariant[]> {
    return await this.variantRepository.find({
      where: { product_id: productId },
      relations: ['combinations', 'combinations.attribute_value', 'combinations.attribute_value.attribute'],
      order: { id: 'ASC' },
    });
  }

  /**
   * Get a specific variant by ID
   */
  async getVariant(variantId: number): Promise<ProductVariant> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['combinations', 'combinations.attribute_value', 'combinations.attribute_value.attribute'],
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
    updates: { sku_suffix?: string; is_active?: boolean },
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
  async setSimpleStock(productId: number, quantity: number): Promise<ProductStock> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    let stock = await this.stockRepository.findOne({
      where: { product_id: productId, variant_id: IsNull() },
    });

    if (stock) {
      stock.quantity = quantity;
    } else {
      stock = this.stockRepository.create({
        product_id: productId,
        variant_id: null,
        quantity,
      });
    }

    return await this.stockRepository.save(stock);
  }

  /**
   * Set stock for a specific variant
   */
  async setVariantStock(
    productId: number,
    variantId: number,
    quantity: number,
  ): Promise<ProductStock> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId, product_id: productId },
    });

    if (!variant) {
      throw new NotFoundException(
        `Variant with ID ${variantId} not found for product ${productId}`,
      );
    }

    let stock = await this.stockRepository.findOne({
      where: { product_id: productId, variant_id: variantId },
    });

    if (stock) {
      stock.quantity = quantity;
    } else {
      stock = this.stockRepository.create({
        product_id: productId,
        variant_id: variantId,
        quantity,
      });
    }

    return await this.stockRepository.save(stock);
  }

  /**
   * Get simple stock for a product (variant_id is NULL)
   */
  async getSimpleStock(productId: number): Promise<ProductStock | null> {
    return await this.stockRepository.findOne({
      where: { product_id: productId, variant_id: IsNull() },
    });
  }

  /**
   * Get stock for a specific variant
   */
  async getVariantStock(
    productId: number,
    variantId: number,
  ): Promise<ProductStock | null> {
    return await this.stockRepository.findOne({
      where: { product_id: productId, variant_id: variantId },
      relations: ['variant', 'variant.combinations', 'variant.combinations.attribute_value'],
    });
  }

  /**
   * Get all stock for a product (both simple and variant)
   */
  async getAllStock(productId: number): Promise<ProductStock[]> {
    return await this.stockRepository.find({
      where: { product_id: productId },
      relations: ['variant', 'variant.combinations', 'variant.combinations.attribute_value'],
      order: { id: 'ASC' },
    });
  }

  /**
   * Deduct stock for a variant
   */
  async deductStock(
    productId: number,
    variantId: number | null,
    quantity: number,
  ): Promise<ProductStock> {
    const whereCondition = variantId
      ? { product_id: productId, variant_id: variantId }
      : { product_id: productId, variant_id: IsNull() };

    const stock = await this.stockRepository.findOne({
      where: whereCondition as any,
    });

    if (!stock) {
      throw new NotFoundException(
        variantId
          ? `Stock not found for variant ${variantId}`
          : `Stock not found for product ${productId}`,
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
    productId: number,
    variantId: number | null,
  ): Promise<{ available: boolean; quantity: number }> {
    const whereCondition = variantId
      ? { product_id: productId, variant_id: variantId }
      : { product_id: productId, variant_id: IsNull() };

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
    productId: number,
    attributeId: number,
    updates: {
      controls_pricing?: boolean;
      controls_media?: boolean;
      controls_weight?: boolean;
    },
  ): Promise<ProductAttribute> {
    const productAttr = await this.productAttributeRepository.findOne({
      where: { product_id: productId, attribute_id: attributeId },
    });

    if (!productAttr) {
      throw new NotFoundException(
        `Product attribute for product ${productId} with attribute ID ${attributeId} not found`,
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
  async getProductAttributes(productId: number): Promise<ProductAttribute[]> {
    return await this.productAttributeRepository.find({
      where: { product_id: productId },
      relations: ['attribute', 'attribute.values'],
    });
  }
}
