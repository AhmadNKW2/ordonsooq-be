import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
   * @param product_id - The product ID
   * @param combination - Map of attribute_id -> attribute_value_id (only for pricing-controlling attributes)
   * @param priceData - The pricing data (cost, price, sale_price)
   * @returns The found or created price group
   */
  async findOrCreatePriceGroup(
    product_id: number,
    combination: Record<string, number>,
    priceData: PriceGroupData,
  ): Promise<ProductPriceGroup> {
    // Check if a group with exactly this combination already exists
    const existingGroup = await this.findGroupByCombination(
      product_id,
      combination,
    );

    if (existingGroup) {
      // Update the existing group with new price data
      existingGroup.cost = priceData.cost;
      existingGroup.price = priceData.price;
      existingGroup.sale_price = priceData.sale_price;
      return this.priceGroupRepository.save(existingGroup);
    }

    // Create new group
    const priceGroup = this.priceGroupRepository.create({
      product_id: product_id,
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

  async getPriceForVariant(
    productId: number,
    variantId?: number,
  ): Promise<ProductPriceGroup | null> {
    if (!variantId) {
      // Find default group (no attribute values)
      const existingGroups = await this.priceGroupRepository.find({
        where: { product_id: productId },
        relations: ['groupValues'],
      });
      return existingGroups.find((g) => g.groupValues.length === 0) || null;
    }

    // Get variant combinations
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['combinations'],
    });

    if (!variant) return null;

    // Get pricing attributes for this product
    const pricingAttributes = await this.productAttributeRepository.find({
      where: { product_id: productId, controls_pricing: true },
    });

    const pricingAttributeIds = new Set(
      pricingAttributes.map((pa) => pa.attribute_id),
    );

    // Build combination map
    const combination: Record<string, number> = {};
    for (const combo of variant.combinations) {
      if (pricingAttributeIds.has(combo.attribute_value.attribute_id)) {
        combination[combo.attribute_value.attribute_id] = combo.attribute_value_id;
      }
    }

    return this.findGroupByCombination(productId, combination);
  }

  /**
   * Optimized method to get prices for multiple items at once
   */
  async getPricesForCartItems(
    items: {
      productId: number;
      variantId: number | null;
      variant?: ProductVariant;
    }[],
  ): Promise<(ProductPriceGroup | null)[]> {
    if (items.length === 0) return [];

    const productIds = [...new Set(items.map((i) => i.productId))];

    // 1. Fetch pricing attributes for all products
    const pricingAttributes = await this.productAttributeRepository.find({
      where: {
        product_id: In(productIds),
        controls_pricing: true,
      },
    });

    const pricingAttrsByProduct = new Map<number, Set<number>>();
    for (const pa of pricingAttributes) {
      if (!pricingAttrsByProduct.has(pa.product_id)) {
        pricingAttrsByProduct.set(pa.product_id, new Set());
      }
      pricingAttrsByProduct.get(pa.product_id)!.add(pa.attribute_id);
    }

    // 2. Fetch price groups for all products
    const priceGroups = await this.priceGroupRepository.find({
      where: { product_id: In(productIds) },
      relations: ['groupValues'],
    });

    const priceGroupsByProduct = new Map<number, ProductPriceGroup[]>();
    for (const pg of priceGroups) {
      if (!priceGroupsByProduct.has(pg.product_id)) {
        priceGroupsByProduct.set(pg.product_id, []);
      }
      priceGroupsByProduct.get(pg.product_id)!.push(pg);
    }

    // 3. Match prices
    const results: (ProductPriceGroup | null)[] = [];

    for (const item of items) {
      const groups = priceGroupsByProduct.get(item.productId) || [];

      if (!item.variantId) {
        // Simple product / No variant - find group with no values
        const simpleGroup = groups.find((g) => g.groupValues.length === 0);
        results.push(simpleGroup || null);
        continue;
      }

      const variant = item.variant;
      // If variant is not provided or incomplete, return null to avoid N+1 fallback here
      if (!variant || !variant.combinations) {
        results.push(null);
        continue;
      }

      const productPricingAttrs = pricingAttrsByProduct.get(item.productId);

      // Build combination map
      const combination: Record<string, number> = {};

      if (productPricingAttrs) {
        for (const combo of variant.combinations) {
          // Check if attribute_value is present
          const attrId = combo.attribute_value?.attribute_id;
          if (attrId && productPricingAttrs.has(attrId)) {
            combination[attrId.toString()] = combo.attribute_value_id;
          }
        }
      }

      // Find group with exact matching values
      const combinationSize = Object.keys(combination).length;
      let foundGroup: ProductPriceGroup | null = null;

      for (const group of groups) {
        if (group.groupValues.length !== combinationSize) continue;

        let allMatch = true;
        for (const [attrId, valueId] of Object.entries(combination)) {
          const matching = group.groupValues.find(
            (gv) =>
              gv.attribute_id === parseInt(attrId) &&
              gv.attribute_value_id === valueId,
          );
          if (!matching) {
            allMatch = false;
            break;
          }
        }

        if (allMatch) {
          foundGroup = group;
          break;
        }
      }
      results.push(foundGroup);
    }

    return results;
  }

  /**
   * Find a price group that matches exactly the given combination
   */
  private async findGroupByCombination(
    product_id: number,
    combination: Record<string, number>,
  ): Promise<ProductPriceGroup | null> {
    const groups = await this.priceGroupRepository.find({
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
          (gv) =>
            gv.attribute_id === parseInt(attrId) &&
            gv.attribute_value_id === valueId,
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
    product_id: number,
    priceData: PriceGroupData,
  ): Promise<ProductPriceGroup> {
    // Find existing simple group (one with no group values)
    const existingGroups = await this.priceGroupRepository.find({
      where: { product_id: product_id },
      relations: ['groupValues'],
    });

    const simpleGroup = existingGroups.find((g) => g.groupValues.length === 0);

    if (simpleGroup) {
      simpleGroup.cost = priceData.cost;
      simpleGroup.price = priceData.price;
      simpleGroup.sale_price = priceData.sale_price;
      return this.priceGroupRepository.save(simpleGroup);
    }

    // Create new simple group
    const priceGroup = this.priceGroupRepository.create({
      product_id: product_id,
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
  async getPriceGroupForVariant(
    variantId: number,
  ): Promise<ProductPriceGroup | null> {
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

    const pricingAttrIds = pricingAttrs.map((pa) => pa.attribute_id);

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
  async getPriceGroupsForProduct(
    product_id: number,
  ): Promise<ProductPriceGroup[]> {
    return this.priceGroupRepository.find({
      where: { product_id: product_id },
      relations: [
        'groupValues',
        'groupValues.attribute',
        'groupValues.attributeValue',
      ],
    });
  }

  /**
   * Bulk create price groups and their values
   * This assumes all previous groups have been deleted
   */
  async bulkCreatePriceGroups(
    product_id: number,
    items: Array<{
      combination?: Record<string, number>;
      cost: number;
      price: number;
      sale_price?: number;
    }>,
  ): Promise<void> {
    if (items.length === 0) return;

    // 1. Create all group entities
    const groups = items.map((item) =>
      this.priceGroupRepository.create({
        product_id: product_id,
        cost: item.cost,
        price: item.price,
        sale_price: item.sale_price,
      }),
    );

    // 2. Save groups in bulk to get IDs
    const savedGroups = await this.priceGroupRepository.save(groups);

    // 3. Prepare group values
    const groupValues: ProductPriceGroupValue[] = [];

    items.forEach((item, index) => {
      const group = savedGroups[index];
      if (item.combination && Object.keys(item.combination).length > 0) {
        for (const [attrId, valueId] of Object.entries(item.combination)) {
          groupValues.push(
            this.priceGroupValueRepository.create({
              price_group_id: group.id,
              attribute_id: parseInt(attrId),
              attribute_value_id: valueId,
            }),
          );
        }
      }
    });

    // 4. Save group values in bulk
    if (groupValues.length > 0) {
      // Save in chunks to avoid parameter limit issues
      const chunkSize = 1000;
      for (let i = 0; i < groupValues.length; i += chunkSize) {
        await this.priceGroupValueRepository.save(
          groupValues.slice(i, i + chunkSize),
        );
      }
    }
  }

  /**
   * Delete all price groups for a product
   */
  async deletePriceGroupsForProduct(product_id: number): Promise<void> {
    await this.priceGroupRepository.delete({ product_id: product_id });
  }
}
