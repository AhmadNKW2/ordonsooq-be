import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductWeightGroup } from './entities/product-weight-group.entity';
import { ProductWeightGroupValue } from './entities/product-weight-group-value.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductVariant } from './entities/product-variant.entity';

interface WeightGroupData {
  weight: number;
  length?: number;
  width?: number;
  height?: number;
}

@Injectable()
export class ProductWeightGroupService {
  constructor(
    @InjectRepository(ProductWeightGroup)
    private weightGroupRepository: Repository<ProductWeightGroup>,
    @InjectRepository(ProductWeightGroupValue)
    private weightGroupValueRepository: Repository<ProductWeightGroupValue>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
  ) {}

  /**
   * Find or create a weight group for a product based on attribute values
   * 
   * @param product_id - The product ID
   * @param combination - Map of attribute_id -> attribute_value_id (only for weight-controlling attributes)
   * @param weightData - The weight data (weight, dimensions)
   * @returns The found or created weight group
   */
  async findOrCreateWeightGroup(
    product_id: number,
    combination: Record<string, number>,
    weightData: WeightGroupData,
  ): Promise<ProductWeightGroup> {
    // Check if a group with exactly this combination already exists
    const existingGroup = await this.findGroupByCombination(product_id, combination);
    
    if (existingGroup) {
      // Update the existing group with new weight data
      existingGroup.weight = weightData.weight;
      existingGroup.length = weightData.length;
      existingGroup.width = weightData.width;
      existingGroup.height = weightData.height;
      return this.weightGroupRepository.save(existingGroup);
    }

    // Create new group
    const weightGroup = this.weightGroupRepository.create({
      product_id: product_id,
      weight: weightData.weight,
      length: weightData.length,
      width: weightData.width,
      height: weightData.height,
    });
    
    const savedGroup = await this.weightGroupRepository.save(weightGroup);

    // Create group values for each attribute in the combination
    for (const [attrId, valueId] of Object.entries(combination)) {
      const groupValue = this.weightGroupValueRepository.create({
        weight_group_id: savedGroup.id,
        attribute_id: parseInt(attrId),
        attribute_value_id: valueId,
      });
      await this.weightGroupValueRepository.save(groupValue);
    }

    const result = await this.weightGroupRepository.findOne({
      where: { id: savedGroup.id },
      relations: ['groupValues'],
    });
    return result!;
  }

  /**
   * Find a weight group that matches exactly the given combination
   */
  private async findGroupByCombination(
    product_id: number,
    combination: Record<string, number>,
  ): Promise<ProductWeightGroup | null> {
    const groups = await this.weightGroupRepository.find({
      where: { product_id: product_id },
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
   * Create a simple product weight group (no combination)
   */
  async createSimpleWeightGroup(
    product_id: number,
    weightData: WeightGroupData,
  ): Promise<ProductWeightGroup> {
    // Find existing simple group (one with no group values)
    const existingGroups = await this.weightGroupRepository.find({
      where: { product_id: product_id },
      relations: ['groupValues'],
    });

    const simpleGroup = existingGroups.find(g => g.groupValues.length === 0);

    if (simpleGroup) {
      simpleGroup.weight = weightData.weight;
      simpleGroup.length = weightData.length;
      simpleGroup.width = weightData.width;
      simpleGroup.height = weightData.height;
      return this.weightGroupRepository.save(simpleGroup);
    }

    // Create new simple group
    const weightGroup = this.weightGroupRepository.create({
      product_id: product_id,
      weight: weightData.weight,
      length: weightData.length,
      width: weightData.width,
      height: weightData.height,
    });
    
    return this.weightGroupRepository.save(weightGroup);
  }

  /**
   * Get the weight group for a specific variant
   * Extracts weight-controlling attribute values from the variant
   */
  async getWeightGroupForVariant(variantId: number): Promise<ProductWeightGroup | null> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['combinations', 'combinations.attribute_value', 'product'],
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    // Get product attributes that control weight
    const weightAttrs = await this.productAttributeRepository.find({
      where: { product_id: variant.product_id, controls_weight: true },
    });

    const weightAttrIds = weightAttrs.map(pa => pa.attribute_id);

    // Build combination from variant's attribute values that control weight
    const combination: Record<string, number> = {};
    for (const combo of variant.combinations) {
      const attrId = combo.attribute_value?.attribute_id;
      if (attrId && weightAttrIds.includes(attrId)) {
        combination[attrId.toString()] = combo.attribute_value_id;
      }
    }

    return this.findGroupByCombination(variant.product_id, combination);
  }

  /**
   * Get all weight groups for a product
   */
  async getWeightGroupsForProduct(product_id: number): Promise<ProductWeightGroup[]> {
    return this.weightGroupRepository.find({
      where: { product_id: product_id },
      relations: ['groupValues', 'groupValues.attribute', 'groupValues.attributeValue'],
    });
  }

  /**
   * Delete all weight groups for a product
   */
  async deleteWeightGroupsForProduct(product_id: number): Promise<void> {
    await this.weightGroupRepository.delete({ product_id: product_id });
  }
}
