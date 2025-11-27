import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductMediaGroup } from './entities/product-media-group.entity';
import { ProductMediaGroupValue } from './entities/product-media-group-value.entity';
import { ProductMedia, MediaType } from './entities/product-media.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductVariant } from './entities/product-variant.entity';

@Injectable()
export class ProductMediaGroupService {
  constructor(
    @InjectRepository(ProductMediaGroup)
    private mediaGroupRepository: Repository<ProductMediaGroup>,
    @InjectRepository(ProductMediaGroupValue)
    private mediaGroupValueRepository: Repository<ProductMediaGroupValue>,
    @InjectRepository(ProductMedia)
    private mediaRepository: Repository<ProductMedia>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
  ) {}

  /**
   * Find or create a media group for a product based on attribute values
   * 
   * @param productId - The product ID
   * @param combination - Map of attribute_id -> attribute_value_id (only for media-controlling attributes)
   * @returns The found or created media group
   */
  async findOrCreateMediaGroup(
    productId: number,
    combination: Record<string, number>,
  ): Promise<ProductMediaGroup> {
    // Check if a group with exactly this combination already exists
    const existingGroup = await this.findGroupByCombination(productId, combination);
    
    if (existingGroup) {
      return existingGroup;
    }

    // Create new group
    const mediaGroup = this.mediaGroupRepository.create({
      product_id: productId,
    });
    
    const savedGroup = await this.mediaGroupRepository.save(mediaGroup);

    // Create group values for each attribute in the combination
    for (const [attrId, valueId] of Object.entries(combination)) {
      const groupValue = this.mediaGroupValueRepository.create({
        media_group_id: savedGroup.id,
        attribute_id: parseInt(attrId),
        attribute_value_id: valueId,
      });
      await this.mediaGroupValueRepository.save(groupValue);
    }

    const result = await this.mediaGroupRepository.findOne({
      where: { id: savedGroup.id },
      relations: ['groupValues'],
    });
    return result!;
  }

  /**
   * Find a media group that matches exactly the given combination
   */
  async findGroupByCombination(
    productId: number,
    combination: Record<string, number>,
  ): Promise<ProductMediaGroup | null> {
    const groups = await this.mediaGroupRepository.find({
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
   * Create a simple product media group (no combination - for general product images)
   */
  async createSimpleMediaGroup(productId: number): Promise<ProductMediaGroup> {
    // Find existing simple group (one with no group values)
    const existingGroups = await this.mediaGroupRepository.find({
      where: { product_id: productId },
      relations: ['groupValues'],
    });

    const simpleGroup = existingGroups.find(g => g.groupValues.length === 0);

    if (simpleGroup) {
      return simpleGroup;
    }

    // Create new simple group
    const mediaGroup = this.mediaGroupRepository.create({
      product_id: productId,
    });
    
    return this.mediaGroupRepository.save(mediaGroup);
  }

  /**
   * Add media to a media group
   */
  async addMediaToGroup(
    productId: number,
    mediaGroupId: number,
    url: string,
    type: MediaType = MediaType.IMAGE,
    sortOrder: number = 0,
    isPrimary: boolean = false,
  ): Promise<ProductMedia> {
    const media = this.mediaRepository.create({
      product_id: productId,
      media_group_id: mediaGroupId,
      url,
      type,
      sort_order: sortOrder,
      is_primary: isPrimary,
    });
    
    return this.mediaRepository.save(media);
  }

  /**
   * Get the media group for a specific variant
   * Extracts media-controlling attribute values from the variant and finds/creates the group
   */
  async getOrCreateMediaGroupForVariant(variantId: number): Promise<ProductMediaGroup> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: ['combinations', 'combinations.attribute_value', 'product'],
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    // Get product attributes that control media
    const mediaAttrs = await this.productAttributeRepository.find({
      where: { product_id: variant.product_id, controls_media: true },
    });

    const mediaAttrIds = mediaAttrs.map(pa => pa.attribute_id);

    // If no attributes control media, return/create simple group
    if (mediaAttrIds.length === 0) {
      return this.createSimpleMediaGroup(variant.product_id);
    }

    // Build combination from variant's attribute values that control media
    const combination: Record<string, number> = {};
    for (const combo of variant.combinations) {
      const attrId = combo.attribute_value?.attribute_id;
      if (attrId !== undefined && mediaAttrIds.includes(attrId)) {
        combination[attrId.toString()] = combo.attribute_value_id;
      }
    }

    return this.findOrCreateMediaGroup(variant.product_id, combination);
  }

  /**
   * Get all media groups for a product with their media items
   */
  async getMediaGroupsForProduct(productId: number): Promise<ProductMediaGroup[]> {
    return this.mediaGroupRepository.find({
      where: { product_id: productId },
      relations: ['groupValues', 'groupValues.attribute', 'groupValues.attributeValue', 'media'],
    });
  }

  /**
   * Get all media for a product
   */
  async getMediaForProduct(productId: number): Promise<ProductMedia[]> {
    return this.mediaRepository.find({
      where: { product_id: productId },
      relations: ['mediaGroup', 'mediaGroup.groupValues'],
      order: { sort_order: 'ASC' },
    });
  }

  /**
   * Delete all media groups for a product
   */
  async deleteMediaGroupsForProduct(productId: number): Promise<void> {
    await this.mediaGroupRepository.delete({ product_id: productId });
  }

  /**
   * Delete specific media
   */
  async deleteMedia(mediaId: number): Promise<void> {
    await this.mediaRepository.delete({ id: mediaId });
  }
}
