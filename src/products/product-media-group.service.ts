import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductMediaGroup } from './entities/product-media-group.entity';
import { ProductMediaGroupValue } from './entities/product-media-group-value.entity';
import { Media, MediaType } from '../media/entities/media.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductVariant } from './entities/product-variant.entity';

interface MediaSyncItem {
  media_id: number;
  is_primary?: boolean;
  is_group_primary?: boolean;
  sort_order?: number;
  combination?: Record<string, number>;
}

@Injectable()
export class ProductMediaGroupService {
  constructor(
    @InjectRepository(ProductMediaGroup)
    private mediaGroupRepository: Repository<ProductMediaGroup>,
    @InjectRepository(ProductMediaGroupValue)
    private mediaGroupValueRepository: Repository<ProductMediaGroupValue>,
    @InjectRepository(Media)
    private mediaRepository: Repository<Media>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
    @InjectRepository(ProductVariant)
    private variantRepository: Repository<ProductVariant>,
  ) {}

  /**
   * Find or create a media group for a product based on attribute values
   *
   * @param product_id - The product ID
   * @param combination - Map of attribute_id -> attribute_value_id (only for media-controlling attributes)
   * @returns The found or created media group
   */
  async findOrCreateMediaGroup(
    product_id: number,
    combination: Record<string, number>,
  ): Promise<ProductMediaGroup> {
    // Check if a group with exactly this combination already exists
    const existingGroup = await this.findGroupByCombination(
      product_id,
      combination,
    );

    if (existingGroup) {
      return existingGroup;
    }

    // Create new group
    const mediaGroup = this.mediaGroupRepository.create({
      product_id: product_id,
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
    product_id: number,
    combination: Record<string, number>,
  ): Promise<ProductMediaGroup | null> {
    const groups = await this.mediaGroupRepository.find({
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
   * Create a simple product media group (no combination - for general product images)
   */
  async createSimpleMediaGroup(product_id: number): Promise<ProductMediaGroup> {
    // Find existing simple group (one with no group values)
    const existingGroups = await this.mediaGroupRepository.find({
      where: { product_id: product_id },
      relations: ['groupValues'],
    });

    const simpleGroup = existingGroups.find((g) => g.groupValues.length === 0);

    if (simpleGroup) {
      return simpleGroup;
    }

    // Create new simple group
    const mediaGroup = this.mediaGroupRepository.create({
      product_id: product_id,
    });

    return this.mediaGroupRepository.save(mediaGroup);
  }

  /**
   * Add media to a media group
   */
  async addMediaToGroup(
    product_id: number,
    mediaGroupId: number,
    url: string,
    type: MediaType = MediaType.IMAGE,
    sortOrder: number = 0,
    isPrimary: boolean = false,
  ): Promise<Media> {
    const media = this.mediaRepository.create({
      product_id: product_id,
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
  async getOrCreateMediaGroupForVariant(
    variantId: number,
  ): Promise<ProductMediaGroup> {
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

    const mediaAttrIds = mediaAttrs.map((pa) => pa.attribute_id);

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
  async getMediaGroupsForProduct(
    product_id: number,
  ): Promise<ProductMediaGroup[]> {
    return this.mediaGroupRepository.find({
      where: { product_id: product_id },
      relations: [
        'groupValues',
        'groupValues.attribute',
        'groupValues.attributeValue',
        'media',
      ],
    });
  }

  /**
   * Get all media for a product
   */
  async getMediaForProduct(product_id: number): Promise<Media[]> {
    return this.mediaRepository.find({
      where: { product_id: product_id },
      relations: ['mediaGroup', 'mediaGroup.groupValues'],
      order: { sort_order: 'ASC' },
    });
  }

  /**
   * Delete all media groups for a product
   */
  async deleteMediaGroupsForProduct(product_id: number): Promise<void> {
    await this.mediaGroupRepository.delete({ product_id: product_id });
  }

  /**
   * Delete specific media
   */
  async deleteMedia(mediaId: number): Promise<void> {
    await this.mediaRepository.delete({ id: mediaId });
  }

  /**
   * Set a media item as primary
   * Optionally scope to variant media only (media with group values) or product media (no group values)
   */
  async setPrimaryMedia(
    mediaId: number,
    isVariantMedia?: boolean,
  ): Promise<Media> {
    const media = await this.mediaRepository.findOne({
      where: { id: mediaId },
      relations: ['mediaGroup', 'mediaGroup.groupValues'],
    });

    if (!media) {
      throw new NotFoundException(`Media with ID ${mediaId} not found`);
    }

    // Determine query conditions for resetting other media
    const resetConditions: any = { product_id: media.product_id };

    if (isVariantMedia !== undefined) {
      if (isVariantMedia) {
        // Reset only variant media (media with group values) in the same group
        if (media.media_group_id) {
          resetConditions.media_group_id = media.media_group_id;
        }
      }
      // If isVariantMedia is false, reset all media for the product
    }

    // Reset is_primary for other media
    await this.mediaRepository.update(resetConditions, { is_primary: false });

    // Set this media as primary
    media.is_primary = true;
    return this.mediaRepository.save(media);
  }

  /**
   * Reorder media items by updating their sort_order
   */
  async reorderMedia(
    reorderItems: { media_id: number; sort_order: number }[],
  ): Promise<void> {
    for (const item of reorderItems) {
      await this.mediaRepository.update(
        { id: item.media_id },
        { sort_order: item.sort_order },
      );
    }
  }

  /**
   * Sync product media with the provided list
   *
   * Logic:
   * 1. Validate only one primary image per product
   * 2. Get all existing media for this product
   * 3. For each item in payload:
   *    - If media_id exists and is linked to product -> update is_primary, sort_order, combination
   *    - If media_id exists but not linked -> link to product with settings
   * 4. For each existing media not in payload -> unlink from product
   *
   * @param product_id - The product ID
   * @param mediaItems - Array of media items from the payload
   */
  async syncProductMedia(
    product_id: number,
    mediaItems: MediaSyncItem[],
  ): Promise<void> {
    // Validate: only one global primary image allowed per product
    // Note: use is_group_primary for a "main image" within each media group.
    const primaryImages = mediaItems.filter((item) => item.is_primary === true);
    if (primaryImages.length > 1) {
      throw new BadRequestException(
        `Product can only have one primary image (is_primary). Found ${primaryImages.length} items marked as primary. Use is_group_primary for per-group main images.`,
      );
    }
    // Get all existing product media
    const existingMedia = await this.mediaRepository.find({
      where: { product_id: product_id },
    });

    const existingMediaMap = new Map<number, Media>();
    for (const m of existingMedia) {
      existingMediaMap.set(m.id, m);
    }

    const payloadMediaIds = new Set<number>();

    // Pre-resolve all media groups sequentially (no race condition)
    // Group media items by their combination key so we call findOrCreate once per unique combination
    const combinationKeyToGroupId = new Map<string, number>();

    const getCombinationKey = (item: MediaSyncItem): string => {
      if (!item.combination || Object.keys(item.combination).length === 0) {
        return '__simple__';
      }
      return Object.entries(item.combination)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
    };

    for (const item of mediaItems) {
      const key = getCombinationKey(item);
      if (!combinationKeyToGroupId.has(key)) {
        let groupId: number;
        if (key === '__simple__') {
          const g = await this.createSimpleMediaGroup(product_id);
          groupId = g.id;
        } else {
          const g = await this.findOrCreateMediaGroup(product_id, item.combination!);
          groupId = g.id;
        }
        combinationKeyToGroupId.set(key, groupId);
      }
    }

    // Process each item in the payload (now safe to run in parallel — groups pre-resolved)
    await Promise.all(
      mediaItems.map(async (item) => {
        const key = getCombinationKey(item);
        const mediaGroupId = combinationKeyToGroupId.get(key)!;

        // Check if this media_id already exists as product media
        const media = existingMediaMap.get(item.media_id);

        if (media) {
          // Update existing media
          payloadMediaIds.add(item.media_id);

          media.is_primary = item.is_primary ?? false;
          media.is_group_primary = item.is_group_primary ?? false;
          media.sort_order = item.sort_order ?? 0;
          media.media_group_id = mediaGroupId;

          await this.mediaRepository.save(media);
        } else {
          // Link existing media to product
          const unlinkedMedia = await this.mediaRepository.findOne({
            where: { id: item.media_id },
          });

          if (!unlinkedMedia) {
            throw new NotFoundException(
              `Media with ID ${item.media_id} not found`,
            );
          }

          unlinkedMedia.product_id = product_id;
          unlinkedMedia.media_group_id = mediaGroupId;
          unlinkedMedia.sort_order = item.sort_order ?? 0;
          unlinkedMedia.is_primary = item.is_primary ?? false;
          unlinkedMedia.is_group_primary = item.is_group_primary ?? false;

          await this.mediaRepository.save(unlinkedMedia);
          payloadMediaIds.add(item.media_id);
        }
      }),
    );

    // Unlink media that are not in the payload (set product_id to null)
    await Promise.all(
      Array.from(existingMediaMap.entries()).map(async ([mediaId, media]) => {
        if (!payloadMediaIds.has(mediaId)) {
          media.product_id = null;
          media.media_group_id = null;
          media.is_primary = false;
          media.is_group_primary = false;
          media.sort_order = 0;
          await this.mediaRepository.save(media);
        }
      }),
    );
  }
}
