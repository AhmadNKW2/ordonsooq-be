import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, PricingType } from './entities/product.entity';
import { ProductPricing } from './entities/product-pricing.entity';
import { ProductVariantPricing } from './entities/product-variant-pricing.entity';
import { ProductAttribute } from './entities/product-attribute.entity';

@Injectable()
export class ProductPricingService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductPricing)
    private pricingRepository: Repository<ProductPricing>,
    @InjectRepository(ProductVariantPricing)
    private variantPricingRepository: Repository<ProductVariantPricing>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
  ) {}

  /**
   * Set single pricing for a product
   */
  async setSinglePricing(
    productId: number,
    cost: number,
    price: number,
    salePrice?: number,
  ): Promise<ProductPricing> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.pricing_type !== PricingType.SINGLE) {
      throw new BadRequestException(
        'Product must have pricing_type = "single"',
      );
    }

    let pricing = await this.pricingRepository.findOne({
      where: { product_id: productId },
    });

    if (pricing) {
      pricing.cost = cost;
      pricing.price = price;
      if (salePrice !== undefined) pricing.sale_price = salePrice;
    } else {
      pricing = this.pricingRepository.create({
        product_id: productId,
        cost,
        price,
        sale_price: salePrice,
      });
    }

    return await this.pricingRepository.save(pricing);
  }

  /**
   * Set variant pricing for specific attribute values
   */
  async setVariantPricing(
    productId: number,
    attributeValueId: number,
    cost: number,
    price: number,
    salePrice?: number,
  ): Promise<ProductVariantPricing> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.pricing_type !== PricingType.VARIANT) {
      throw new BadRequestException(
        'Product must have pricing_type = "variant"',
      );
    }

    // Verify the attribute controls pricing
    const pricingAttribute = await this.productAttributeRepository.findOne({
      where: {
        product_id: productId,
        controls_pricing: true,
      },
    });

    if (!pricingAttribute) {
      throw new BadRequestException(
        'No attribute is set to control pricing for this product',
      );
    }

    let pricing = await this.variantPricingRepository.findOne({
      where: {
        product_id: productId,
        attribute_value_id: attributeValueId,
      },
    });

    if (pricing) {
      pricing.cost = cost;
      pricing.price = price;
      if (salePrice !== undefined) pricing.sale_price = salePrice;
    } else {
      pricing = this.variantPricingRepository.create({
        product_id: productId,
        attribute_value_id: attributeValueId,
        cost,
        price,
        sale_price: salePrice,
      });
    }

    return await this.variantPricingRepository.save(pricing);
  }

  /**
   * Get pricing for a product
   */
  async getPricing(productId: number): Promise<ProductPricing | null> {
    return await this.pricingRepository.findOne({
      where: { product_id: productId },
    });
  }

  /**
   * Get all variant pricing for a product
   */
  async getVariantPricing(
    productId: number,
  ): Promise<ProductVariantPricing[]> {
    return await this.variantPricingRepository.find({
      where: { product_id: productId },
      relations: ['attribute_value', 'attribute_value.attribute'],
    });
  }

  /**
   * Get pricing for specific attribute value
   */
  async getPricingByAttributeValue(
    productId: number,
    attributeValueId: number,
  ): Promise<ProductVariantPricing | null> {
    return await this.variantPricingRepository.findOne({
      where: {
        product_id: productId,
        attribute_value_id: attributeValueId,
      },
      relations: ['attribute_value'],
    });
  }

  /**
   * Delete variant pricing
   */
  async deleteVariantPricing(pricingId: number): Promise<void> {
    const pricing = await this.variantPricingRepository.findOne({
      where: { id: pricingId },
    });

    if (!pricing) {
      throw new NotFoundException(`Pricing with ID ${pricingId} not found`);
    }

    await this.variantPricingRepository.remove(pricing);
  }
}
