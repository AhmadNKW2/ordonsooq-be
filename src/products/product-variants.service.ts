import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, PricingType } from './entities/product.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductVariantStock } from './entities/product-variant-stock.entity';
import { AttributesService } from '../attributes/attributes.service';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
    @InjectRepository(ProductVariantStock)
    private variantStockRepository: Repository<ProductVariantStock>,
    @InjectRepository(AttributeValue)
    private attributeValueRepository: Repository<AttributeValue>,
    private attributesService: AttributesService,
  ) {}

  /**
   * Add attributes to a product and generate all stock combinations
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

    // Generate stock combinations
    await this.generateStockCombinations(productId);

    return productAttributes;
  }

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

    // Regenerate stock combinations
    await this.generateStockCombinations(productAttr.product_id);
  }

  /**
   * Generate all possible stock combinations for a product
   */
  async generateStockCombinations(productId: number): Promise<void> {
    // Get all product attributes with their values
    const productAttributes = await this.productAttributeRepository.find({
      where: { product_id: productId },
      relations: ['attribute', 'attribute.values'],
    });

    if (productAttributes.length === 0) {
      // No attributes, clear all stock entries
      await this.variantStockRepository.delete({ product_id: productId });
      return;
    }

    // Build array of attribute values arrays
    const attributeValueArrays: Array<{ name: string; values: AttributeValue[] }> = [];

    for (const pa of productAttributes) {
      const attribute = await this.attributesService.findOne(pa.attribute_id);
      attributeValueArrays.push({
        name: attribute.name_en,
        values: attribute.values.filter((v) => v.is_active),
      });
    }

    // Generate all combinations
    const combinations = this.generateCombinations(attributeValueArrays);

    // Get existing stock records
    const existingStocks = await this.variantStockRepository.find({
      where: { product_id: productId },
    });

    const existingCombinationKeys = new Set(
      existingStocks.map((s) => JSON.stringify(s.combination)),
    );

    // Add new combinations
    for (const combo of combinations) {
      const comboKey = JSON.stringify(combo);
      if (!existingCombinationKeys.has(comboKey)) {
        const stock = this.variantStockRepository.create({
          product_id: productId,
          combination: combo,
          quantity: 0,
        });
        await this.variantStockRepository.save(stock);
      }
    }

    // Remove obsolete combinations
    const validCombinationKeys = new Set(
      combinations.map((c) => JSON.stringify(c)),
    );

    for (const existingStock of existingStocks) {
      const key = JSON.stringify(existingStock.combination);
      if (!validCombinationKeys.has(key)) {
        await this.variantStockRepository.remove(existingStock);
      }
    }
  }

  /**
   * Helper to generate all combinations from attribute values
   */
  private generateCombinations(
    attributeValueArrays: Array<{ name: string; values: AttributeValue[] }>,
  ): Array<Record<string, string>> {
    if (attributeValueArrays.length === 0) {
      return [];
    }

    const results: Array<Record<string, string>> = [];

    const generate = (current: Record<string, string>, index: number) => {
      if (index === attributeValueArrays.length) {
        results.push({ ...current });
        return;
      }

      const { name, values } = attributeValueArrays[index];
      for (const value of values) {
        current[name] = value.value_en;
        generate(current, index + 1);
      }
    };

    generate({}, 0);
    return results;
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

  /**
   * Get all variant stock records for a product
   */
  async getProductVariantStocks(
    productId: number,
  ): Promise<ProductVariantStock[]> {
    return await this.variantStockRepository.find({
      where: { product_id: productId },
      order: { id: 'ASC' },
    });
  }

  /**
   * Update stock quantity for a specific variant
   */
  async updateVariantStock(
    stockId: number,
    quantity: number,
  ): Promise<ProductVariantStock> {
    const stock = await this.variantStockRepository.findOne({
      where: { id: stockId },
    });

    if (!stock) {
      throw new NotFoundException(`Variant stock with ID ${stockId} not found`);
    }

    stock.quantity = quantity;
    return await this.variantStockRepository.save(stock);
  }

  /**
   * Deduct stock for a specific variant combination
   */
  async deductStock(
    productId: number,
    combination: Record<string, string>,
    quantity: number,
  ): Promise<ProductVariantStock> {
    const stock = await this.variantStockRepository.findOne({
      where: {
        product_id: productId,
        combination: combination as any,
      },
    });

    if (!stock) {
      throw new NotFoundException(
        `Stock not found for combination: ${JSON.stringify(combination)}`,
      );
    }

    if (stock.quantity < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${stock.quantity}, Requested: ${quantity}`,
      );
    }

    stock.quantity -= quantity;
    return await this.variantStockRepository.save(stock);
  }

  /**
   * Check if a variant combination is in stock
   */
  async checkStock(
    productId: number,
    combination: Record<string, string>,
  ): Promise<{ available: boolean; quantity: number }> {
    const stock = await this.variantStockRepository.findOne({
      where: {
        product_id: productId,
        combination: combination as any,
      },
    });

    return {
      available: stock ? stock.quantity > 0 : false,
      quantity: stock ? stock.quantity : 0,
    };
  }
}
