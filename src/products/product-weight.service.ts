import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductWeight } from './entities/product-weight.entity';
import { ProductVariantWeight } from './entities/product-variant-weight.entity';
import { ProductAttribute } from './entities/product-attribute.entity';

@Injectable()
export class ProductWeightService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductWeight)
    private weightRepository: Repository<ProductWeight>,
    @InjectRepository(ProductVariantWeight)
    private variantWeightRepository: Repository<ProductVariantWeight>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
  ) {}

  /**
   * Set single weight/dimensions for a product
   */
  async setProductWeight(
    productId: number,
    weight: number,
    length?: number,
    width?: number,
    height?: number,
  ): Promise<ProductWeight> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    let productWeight = await this.weightRepository.findOne({
      where: { product_id: productId },
    });

    if (productWeight) {
      productWeight.weight = weight;
      if (length !== undefined) productWeight.length = length;
      if (width !== undefined) productWeight.width = width;
      if (height !== undefined) productWeight.height = height;
    } else {
      productWeight = this.weightRepository.create({
        product_id: productId,
        weight,
        length,
        width,
        height,
      });
    }

    return await this.weightRepository.save(productWeight);
  }

  /**
   * Set variant weight/dimensions for specific attribute value
   */
  async setVariantWeight(
    productId: number,
    attributeValueId: number,
    weight: number,
    length?: number,
    width?: number,
    height?: number,
  ): Promise<ProductVariantWeight> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Verify attribute controls weight
    const weightAttribute = await this.productAttributeRepository.findOne({
      where: {
        product_id: productId,
        controls_weight: true,
      },
    });

    if (!weightAttribute) {
      throw new BadRequestException(
        'No attribute is set to control weight for this product',
      );
    }

    let variantWeight = await this.variantWeightRepository.findOne({
      where: {
        product_id: productId,
        attribute_value_id: attributeValueId,
      },
    });

    if (variantWeight) {
      variantWeight.weight = weight;
      if (length !== undefined) variantWeight.length = length;
      if (width !== undefined) variantWeight.width = width;
      if (height !== undefined) variantWeight.height = height;
    } else {
      variantWeight = this.variantWeightRepository.create({
        product_id: productId,
        attribute_value_id: attributeValueId,
        weight,
        length,
        width,
        height,
      });
    }

    return await this.variantWeightRepository.save(variantWeight);
  }

  /**
   * Get product weight
   */
  async getProductWeight(productId: number): Promise<ProductWeight | null> {
    return await this.weightRepository.findOne({
      where: { product_id: productId },
    });
  }

  /**
   * Get all variant weights for a product
   */
  async getVariantWeights(
    productId: number,
  ): Promise<ProductVariantWeight[]> {
    return await this.variantWeightRepository.find({
      where: { product_id: productId },
      relations: ['attribute_value', 'attribute_value.attribute'],
    });
  }

  /**
   * Get weight for specific attribute value
   */
  async getWeightByAttributeValue(
    productId: number,
    attributeValueId: number,
  ): Promise<ProductVariantWeight | null> {
    return await this.variantWeightRepository.findOne({
      where: {
        product_id: productId,
        attribute_value_id: attributeValueId,
      },
      relations: ['attribute_value'],
    });
  }

  /**
   * Delete variant weight
   */
  async deleteVariantWeight(weightId: number): Promise<void> {
    const weight = await this.variantWeightRepository.findOne({
      where: { id: weightId },
    });

    if (!weight) {
      throw new NotFoundException(`Weight with ID ${weightId} not found`);
    }

    await this.variantWeightRepository.remove(weight);
  }
}
