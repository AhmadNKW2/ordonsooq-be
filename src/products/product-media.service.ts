import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductMedia, MediaType } from './entities/product-media.entity';
import { ProductVariantMedia } from './entities/product-variant-media.entity';
import { ProductAttribute } from './entities/product-attribute.entity';

@Injectable()
export class ProductMediaService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductMedia)
    private mediaRepository: Repository<ProductMedia>,
    @InjectRepository(ProductVariantMedia)
    private variantMediaRepository: Repository<ProductVariantMedia>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
  ) {}

  /**
   * Add general product media (not variant-specific)
   */
  async addProductMedia(
    productId: number,
    url: string,
    type: MediaType,
    sortOrder: number = 0,
    isPrimary: boolean = false,
  ): Promise<ProductMedia> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // If setting as primary, unset other primary media
    if (isPrimary) {
      await this.mediaRepository.update(
        { product_id: productId, is_primary: true },
        { is_primary: false },
      );
    }

    const media = this.mediaRepository.create({
      product_id: productId,
      url,
      type,
      sort_order: sortOrder,
      is_primary: isPrimary,
    });

    return await this.mediaRepository.save(media);
  }

  /**
   * Add variant-specific media
   */
  async addVariantMedia(
    productId: number,
    attributeValueId: number,
    url: string,
    type: MediaType,
    sortOrder: number = 0,
    isPrimary: boolean = false,
  ): Promise<ProductVariantMedia> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Verify attribute controls media
    const mediaAttribute = await this.productAttributeRepository.findOne({
      where: {
        product_id: productId,
        controls_media: true,
      },
    });

    if (!mediaAttribute) {
      throw new BadRequestException(
        'No attribute is set to control media for this product',
      );
    }

    // If setting as primary, unset other primary media for this variant
    if (isPrimary) {
      await this.variantMediaRepository.update(
        {
          product_id: productId,
          attribute_value_id: attributeValueId,
          is_primary: true,
        },
        { is_primary: false },
      );
    }

    const media = this.variantMediaRepository.create({
      product_id: productId,
      attribute_value_id: attributeValueId,
      url,
      type,
      sort_order: sortOrder,
      is_primary: isPrimary,
    });

    return await this.variantMediaRepository.save(media);
  }

  /**
   * Get all product media
   */
  async getProductMedia(productId: number): Promise<ProductMedia[]> {
    return await this.mediaRepository.find({
      where: { product_id: productId },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Get variant media for specific attribute value
   */
  async getVariantMedia(
    productId: number,
    attributeValueId: number,
  ): Promise<ProductVariantMedia[]> {
    return await this.variantMediaRepository.find({
      where: {
        product_id: productId,
        attribute_value_id: attributeValueId,
      },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Set media as primary
   */
  async setPrimaryMedia(mediaId: number, isVariant: boolean = false): Promise<void> {
    if (isVariant) {
      const media = await this.variantMediaRepository.findOne({
        where: { id: mediaId },
      });

      if (!media) {
        throw new NotFoundException(`Media with ID ${mediaId} not found`);
      }

      // Unset other primary for same variant
      await this.variantMediaRepository.update(
        {
          product_id: media.product_id,
          attribute_value_id: media.attribute_value_id,
          is_primary: true,
        },
        { is_primary: false },
      );

      media.is_primary = true;
      await this.variantMediaRepository.save(media);
    } else {
      const media = await this.mediaRepository.findOne({
        where: { id: mediaId },
      });

      if (!media) {
        throw new NotFoundException(`Media with ID ${mediaId} not found`);
      }

      // Unset other primary for product
      await this.mediaRepository.update(
        { product_id: media.product_id, is_primary: true },
        { is_primary: false },
      );

      media.is_primary = true;
      await this.mediaRepository.save(media);
    }
  }

  /**
   * Delete media
   */
  async deleteMedia(mediaId: number, isVariant: boolean = false): Promise<void> {
    if (isVariant) {
      const media = await this.variantMediaRepository.findOne({
        where: { id: mediaId },
      });

      if (!media) {
        throw new NotFoundException(`Media with ID ${mediaId} not found`);
      }

      await this.variantMediaRepository.remove(media);
    } else {
      const media = await this.mediaRepository.findOne({
        where: { id: mediaId },
      });

      if (!media) {
        throw new NotFoundException(`Media with ID ${mediaId} not found`);
      }

      await this.mediaRepository.remove(media);
    }
  }

  /**
   * Update media sort order
   */
  async updateSortOrder(
    mediaId: number,
    sortOrder: number,
    isVariant: boolean = false,
  ): Promise<void> {
    if (isVariant) {
      await this.variantMediaRepository.update({ id: mediaId }, { sort_order: sortOrder });
    } else {
      await this.mediaRepository.update({ id: mediaId }, { sort_order: sortOrder });
    }
  }
}
