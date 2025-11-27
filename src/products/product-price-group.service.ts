import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductPriceGroup } from './entities/product-price-group.entity';
import { ProductPriceGroupValue } from './entities/product-price-group-value.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductVariant } from './entities/product-variant.entity';

interface PriceGroupData {
  cost: number;
  price: number;
  sale_price?: number;
}

@Injectable()
export class ProductPriceGroupService {
  constructor(
    @InjectRepository(ProductPriceGroup)
    private priceGroupRepository: Repository<ProductPriceGroup>,
    @InjectRepository(ProductPriceGroupValue)
    private priceGroupValueRepository: Repository<ProductPriceGroupValue>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
  ) {}

  /**
   * Find or create a price group for a product based on attribute values
   * 
   * @param productId - The product ID
   * @param combination - Map of attribute_id -> attribute_value_id (only for pricing-controlling attributes)
   * @param priceData - The pricing data (cost, price, sale_price)
   * @returns The found or created price group
   */
  async findOrCreatePriceGroup(
    productId: number,
    combination: Record<string, number>,
    priceData: PriceGroupData,
  ): Promise<ProductPriceGroup> {
    // Check if a group with exactly this combination already exists
    const existingGroup = await this.findGroupByCombination(productId, combination);
    
    if (existingGroup) {
      // Update the existing group with new price data
      existingGroup.cost = priceData.cost;
      existingGroup.price = priceData.price;
      existingGroup.sale_price = priceData.sale_price;
      return this.priceGroupRepository.save(existingGroup);
    }

    // Create new group
    const priceGroup = this.priceGroupRepository.create({
      product_id: productId,
      cost: priceData.cost,
      price: priceData.price,
      sale_price: priceData.sale_price,
    });
    
    const savedGroup = await this.priceGroupRepository.save(priceGroup);

    // Create group values for each attribute in the combination
    for (const [attrId, valueId] of Object.entries(combination)) {
      const groupValue = this.priceGroupValueRepository.create({
        price_group_id: savedGroup.id,
        attribute_id: parseInt(attrId),
        attribute_value_id: valueId,
      });
      await this.priceGroupValueRepository.save(groupValue);
    }

    const result = await this.priceGroupRepository.findOne({
      where: { id: savedGroup.id },
      relations: ['groupValues'],
    });
    return result!;
  }

  /**
   * Find a price group that matches exactly the given combination
   */
  private async findGroupByCombination(
    productId: number,
    combination: Record<string, number>,
  ): Promise<ProductPriceGroup | null> {
    const groups = await this.priceGroupRepository.find({
      where: { product_id: productId },
      relations: ['groupValues'],
    });

    const combinationSize = Object.keys(combination).length;

    for (const group of groups) {
      // Must have same number of values
      if (group.groupValues.length !== combinationSize) {
        continue;
      }

      // Check if all values match
      let allMatch = true;
      for (const [attrId, valueId] of Object.entries(combination)) {
        const matchingValue = group.groupValues.find(
          gv => gv.attribute_id === parseInt(attrId) && gv.attribute_value_id === valueId
        );
        if (!matchingValue) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        return group;
      }
    }

    return null;
  }

  /**
   * Create a simple product price group (no combination)
   */
  async createSimplePriceGroup(
    productId: number,
    priceData: PriceGroupData,
  ): Promise<ProductPriceGroup> {
    // Find existing simple group (one with no group values)
    const existingGroups = await this.priceGroupRepository.find({
      where: { product_id: productId },
      relations: ['groupValues'],
    });

    const simpleGroup = existingGroups.find(g => g.groupValues.length === 0);

    if (simpleGroup) {
      simpleGroup.cost = priceData.cost;
      simpleGroup.price = priceData.price;
      simpleGroup.sale_price = priceData.sale_price;
      return this.priceGroupRepository.save(simpleGroup);
    }

    // Create new simple group
    const priceGroup = this.priceGroupRepository.create({
      product_id: productId,
      cost: priceData.cost,
      price: priceData.price,
      sale_price: priceData.sale_price,
    });
    
    return this.priceGroupRepository.save(priceGroup);
  }

  /**
   * Get the price group for a specific variant
   * Extracts pricing-controlling attribute values from the variant
   */
  async getPriceGroupForVariant(variantId: number): Promise<ProductPriceGroup | null> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['combinations', 'combinations.attribute_value', 'product'],
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    // Get product attributes that control pricing
    const pricingAttrs = await this.productAttributeRepository.find({
      where: { product_id: variant.product_id, controls_pricing: true },
    });

    const pricingAttrIds = pricingAttrs.map(pa => pa.attribute_id);

    // Build combination from variant's attribute values that control pricing
    const combination: Record<string, number> = {};
    for (const combo of variant.combinations) {
      const attrId = combo.attribute_value?.attribute_id;
      if (attrId && pricingAttrIds.includes(attrId)) {
        combination[attrId.toString()] = combo.attribute_value_id;
      }
    }

    return this.findGroupByCombination(variant.product_id, combination);
  }

  /**
   * Get all price groups for a product
   */
  async getPriceGroupsForProduct(productId: number): Promise<ProductPriceGroup[]> {
    return this.priceGroupRepository.find({
      where: { product_id: productId },
      relations: ['groupValues', 'groupValues.attribute', 'groupValues.attributeValue'],
    });
  }

  /**
   * Delete all price groups for a product
   */
  async deletePriceGroupsForProduct(productId: number): Promise<void> {
    await this.priceGroupRepository.delete({ product_id: productId });
  }
}
