import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wishlist } from './entities/wishlist.entity';
import { Product, ProductStatus } from '../products/entities/product.entity';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
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

    // Check if already in wishlist
    const existingItem = await this.wishlistRepository.findOne({
      where: {
        user_id: userId,
        product_id: addToWishlistDto.product_id,
      },
    });

    if (existingItem) {
      throw new ConflictException('Product already in wishlist');
    }

    // Create new wishlist item
    const wishlistItem = this.wishlistRepository.create({
      user_id: userId,
      product_id: addToWishlistDto.product_id,
    });

    await this.wishlistRepository.save(wishlistItem);

    return {
      message: 'Product added to wishlist successfully',
    };
  }

  /**
   * Remove a product from user's wishlist
   */
  async removeItem(userId: number, productId: number) {
    const wishlistItem = await this.wishlistRepository.findOne({
      where: {
        user_id: userId,
        product_id: productId,
      },
    });

    if (!wishlistItem) {
      throw new NotFoundException('Product not found in wishlist');
    }

    await this.wishlistRepository.remove(wishlistItem);

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
      relations: ['product', 'product.media', 'product.vendor'],
      order: { created_at: 'DESC' },
    });

    // Map to include product image
    const items = wishlistItems.map((item) => {
      const primaryMedia = item.product?.media?.find((m) => m.is_primary);
      const firstMedia = item.product?.media?.[0];
      const image = primaryMedia?.url || firstMedia?.url || null;

      return {
        id: item.id,
        product_id: item.product_id,
        created_at: item.created_at,
        product: item.product ? {
          id: item.product.id,
          name_en: item.product.name_en,
          name_ar: item.product.name_ar,
          sku: item.product.sku,
          status: item.product.status,
          visible: item.product.visible,
          image,
          vendor: item.product.vendor ? {
            id: item.product.vendor.id,
            name_en: item.product.vendor.name_en,
            name_ar: item.product.vendor.name_ar,
          } : null,
        } : null,
      };
    });

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
  async isProductInWishlist(userId: number, productId: number): Promise<boolean> {
    const item = await this.wishlistRepository.findOne({
      where: { user_id: userId, product_id: productId },
    });
    return !!item;
  }
}
