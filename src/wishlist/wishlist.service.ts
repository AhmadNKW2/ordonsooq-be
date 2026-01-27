import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Wishlist } from './entities/wishlist.entity';
import { Product, ProductStatus } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';

import { ProductsService } from '../products/products.service';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private productVariantRepository: Repository<ProductVariant>,
    private productsService: ProductsService,
  ) {}

  /**
   * Add a product to user's wishlist
   */
  async addItem(userId: number, addToWishlistDto: AddToWishlistDto) {
    // Validate product exists and is active
    const product = await this.productRepository.findOne({
      where: { id: addToWishlistDto.product_id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status === ProductStatus.ARCHIVED) {
      throw new BadRequestException('Cannot add archived product to wishlist');
    }

    const productHasVariants =
      (await this.productVariantRepository.count({
        where: { product_id: product.id },
      })) > 0;

    if (productHasVariants && !addToWishlistDto.variant_id) {
      throw new BadRequestException(
        'variant_id is required when adding a variant product to wishlist',
      );
    }

    // Validate variant if provided
    if (addToWishlistDto.variant_id) {
      const variant = await this.productVariantRepository.findOne({
        where: { id: addToWishlistDto.variant_id },
      });

      if (!variant) {
        throw new NotFoundException('Product variant not found');
      }

      if (variant.product_id !== product.id) {
        throw new BadRequestException(
          'Variant does not belong to this product',
        );
      }

      if (!variant.is_active) {
        throw new BadRequestException(
          'Cannot add inactive variant to wishlist',
        );
      }
    }

    // Check if already in wishlist
    // - For variant products: dedupe by variant_id (allows multiple variants for same product)
    // - For simple products: dedupe by (product_id, variant_id IS NULL)
    const existingItem = await this.wishlistRepository.findOne({
      where: addToWishlistDto.variant_id
        ? {
            user_id: userId,
            variant_id: addToWishlistDto.variant_id,
          }
        : {
            user_id: userId,
            product_id: addToWishlistDto.product_id,
            variant_id: IsNull(),
          },
    });

    if (existingItem) {
      throw new ConflictException(
        addToWishlistDto.variant_id
          ? 'Variant already in wishlist'
          : 'Product already in wishlist',
      );
    }

    // Create new wishlist item
    const wishlistItem = this.wishlistRepository.create({
      user_id: userId,
      product_id: addToWishlistDto.product_id,
      variant_id: addToWishlistDto.variant_id || null,
    });

    await this.wishlistRepository.save(wishlistItem);

    return {
      message: 'Product added to wishlist successfully',
    };
  }

  /**
   * Remove a product from user's wishlist
   */
  async removeItem(userId: number, productId: number, variantId?: number) {
    if (variantId) {
      const wishlistItem = await this.wishlistRepository.findOne({
        where: {
          user_id: userId,
          product_id: productId,
          variant_id: variantId,
        },
      });

      if (!wishlistItem) {
        throw new NotFoundException('Product not found in wishlist');
      }

      await this.wishlistRepository.remove(wishlistItem);
    } else {
      // Backwards compatible: remove all wishlist entries for this product
      // (covers simple products + "remove all variants of this product")
      const result = await this.wishlistRepository.delete({
        user_id: userId,
        product_id: productId,
      });

      if (!result.affected) {
        throw new NotFoundException('Product not found in wishlist');
      }
    }

    return {
      message: 'Product removed from wishlist',
    };
  }

  /**
   * Get all wishlist items for a user
   */
  async getWishlist(userId: number) {
    const wishlistItems = await this.wishlistRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });

    if (wishlistItems.length === 0) {
      return {
        data: [],
        total: 0,
      };
    }

    // Get unique product IDs
    const productIds = [
      ...new Set(wishlistItems.map((item) => item.product_id)),
    ];

    // Fetch formatted products using ProductsService
    const { data: products } = await this.productsService.findAll({
      ids: productIds,
      limit: 1000,
    });

    // Create a map for faster lookup
    const productsMap = new Map(products.map((p) => [p.id, p]));

    // Map to include detailed product
    const items = wishlistItems
      .map((item) => {
        const product = productsMap.get(item.product_id);
        if (!product) return null; // Should not happen if data consistency is good

        return {
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          created_at: item.created_at,
          product: product,
        };
      })
      .filter((item) => item !== null);

    return {
      data: items,
      total: items.length,
    };
  }

  /**
   * Clear all wishlist items for a user
   */
  async clearWishlist(userId: number) {
    await this.wishlistRepository.delete({ user_id: userId });

    return {
      message: 'Wishlist cleared successfully',
    };
  }

  /**
   * Check if a product is in user's wishlist
   */
  async isProductInWishlist(
    userId: number,
    productId: number,
    variantId?: number,
  ): Promise<boolean> {
    const item = await this.wishlistRepository.findOne({
      where: variantId
        ? { user_id: userId, variant_id: variantId }
        : { user_id: userId, product_id: productId, variant_id: IsNull() },
    });
    return !!item;
  }
}
