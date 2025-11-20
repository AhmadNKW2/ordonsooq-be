import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wishlist } from './entities/wishlist.entity';
import { WishlistItem } from './entities/wishlist-item.entity';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(WishlistItem)
    private wishlistItemRepository: Repository<WishlistItem>,
  ) {}

  async getOrCreateWishlist(userId: number): Promise<Wishlist> {
    let wishlist = await this.wishlistRepository.findOne({
      where: { userId },
      relations: ['items', 'items.product'],
    });

    if (!wishlist) {
      wishlist = this.wishlistRepository.create({ userId });
      wishlist = await this.wishlistRepository.save(wishlist);
    }

    return wishlist;
  }

  async addItem(userId: number, addToWishlistDto: AddToWishlistDto) {
    const wishlist = await this.getOrCreateWishlist(userId);

    // Check if product already in wishlist
    const existingItem = await this.wishlistItemRepository.findOne({
      where: {
        wishlistId: wishlist.id,
        productId: addToWishlistDto.productId,
      },
    });

    if (existingItem) {
      throw new ConflictException('Product already in wishlist');
    }

    const item = this.wishlistItemRepository.create({
      wishlistId: wishlist.id,
      productId: addToWishlistDto.productId,
    });

    await this.wishlistItemRepository.save(item);

    return {
      data: await this.getOrCreateWishlist(userId),
      message: 'Product added to wishlist successfully',
    };
  }

  async removeItem(userId: number, productId: number) {
    const wishlist = await this.getOrCreateWishlist(userId);

    const item = await this.wishlistItemRepository.findOne({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    if (!item) {
      throw new NotFoundException('Product not found in wishlist');
    }

    await this.wishlistItemRepository.remove(item);

    return {
      data: await this.getOrCreateWishlist(userId),
      message: 'Product removed from wishlist successfully',
    };
  }

  async getWishlist(userId: number) {
    const wishlist = await this.getOrCreateWishlist(userId);
    
    return {
      data: wishlist,
      message: 'Wishlist retrieved successfully',
    };
  }

  async clearWishlist(userId: number) {
    const wishlist = await this.getOrCreateWishlist(userId);

    await this.wishlistItemRepository.delete({ wishlistId: wishlist.id });

    return {
      data: null,
      message: 'Wishlist cleared successfully',
    };
  }
}
