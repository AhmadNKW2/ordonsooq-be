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

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private productVariantRepository: Repository<ProductVariant>,
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
      relations: [
        'product',
        'product.media',
        'product.vendor',
        'product.category',
        'product.brand',
        'product.priceGroups',
        'variant',
      ],
      order: { created_at: 'DESC' },
    });

    // Map to include product image
    const items = wishlistItems
      .map((item) => {
        if (!item.product) return null;

        const primaryMedia = item.product.media?.find((m) => m.is_primary);
        const firstMedia = item.product.media?.[0];
        const image = primaryMedia?.url || firstMedia?.url || null;

        // Determine price
        // If simple product, there should be one price group.
        // If variant product, there might be multiple. We'll show the minimum price or the first one found.
        let price = 0;
        let sale_price: number | null = null;
        if (item.product.priceGroups && item.product.priceGroups.length > 0) {
          // Find the lowest price to display "From ..."
          const prices = item.product.priceGroups.map((pg) => ({
            price: Number(pg.price),
            sale_price: pg.sale_price ? Number(pg.sale_price) : null,
            effective_price:
              pg.sale_price && Number(pg.sale_price) > 0
                ? Number(pg.sale_price)
                : Number(pg.price),
          }));

          // Sort by effective price
          prices.sort((a, b) => a.effective_price - b.effective_price);

          const bestPrice = prices[0];
          price = bestPrice.price;
          sale_price = bestPrice.sale_price;
        }

        return {
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          created_at: item.created_at,
          product: {
            id: item.product.id,
            name_en: item.product.name_en,
            name_ar: item.product.name_ar,
            sku: item.product.sku,
            status: item.product.status,
            visible: item.product.visible,
            short_description_en: item.product.short_description_en,
            short_description_ar: item.product.short_description_ar,
            price: price,
            sale_price: sale_price,
            image,
            category: item.product.category
              ? {
                  id: item.product.category.id,
                  name_en: item.product.category.name_en,
                  name_ar: item.product.category.name_ar,
                }
              : null,
            brand: item.product.brand
              ? {
                  id: item.product.brand.id,
                  name_en: item.product.brand.name_en,
                  name_ar: item.product.brand.name_ar,
                }
              : null,
            vendor: item.product.vendor
              ? {
                  id: item.product.vendor.id,
                  name_en: item.product.vendor.name_en,
                  name_ar: item.product.vendor.name_ar,
                }
              : null,
          },
        };
      })
      .filter(Boolean); // Filter out nulls if product was deleted

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
