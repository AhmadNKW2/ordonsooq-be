import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product, ProductStatus } from '../products/entities/product.entity';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { ProductPriceGroupService } from '../products/product-price-group.service';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private cartItemRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private priceGroupService: ProductPriceGroupService,
  ) {}

  async getCart(userId: number) {
    let cart = await this.cartRepository
      .createQueryBuilder('cart')
      .leftJoinAndSelect('cart.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.media', 'media')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.combinations', 'combinations')
      .leftJoinAndSelect('combinations.attribute_value', 'attribute_value')
      .leftJoinAndSelect('attribute_value.attribute', 'attribute')
      .where('cart.user_id = :userId', { userId })
      .orderBy('items.id', 'ASC')
      .getOne();

    if (!cart) {
      cart = this.cartRepository.create({
        user_id: userId,
        items: [],
      });
      await this.cartRepository.save(cart);
    }

    // Calculate totals or format structure if needed
    return await this.formatCartResponse(cart);
  }

  async addToCart(userId: number, dto: AddToCartDto) {
    const { product_id, variant_id, quantity = 1 } = dto;

    // Validate product
    const product = await this.productRepository.findOne({
      where: { id: product_id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status === ProductStatus.ARCHIVED) {
      throw new BadRequestException('Cannot add archived product to cart');
    }

    // Get user cart
    let cart = await this.cartRepository.findOne({
      where: { user_id: userId },
      relations: ['items'],
    });

    if (!cart) {
      cart = this.cartRepository.create({
        user_id: userId,
        items: [],
      });
      await this.cartRepository.save(cart);
    }

    // Check if item exists
    const existingItem = await this.cartItemRepository.findOne({
      where: {
        cart_id: cart.id,
        product_id: product_id,
        variant_id: variant_id || IsNull(),
      },
    });

    if (existingItem) {
      existingItem.quantity += quantity;
      await this.cartItemRepository.save(existingItem);
    } else {
      const newItem = this.cartItemRepository.create({
        cart_id: cart.id,
        product_id: product_id,
        variant_id: variant_id,
        quantity: quantity,
      });
      await this.cartItemRepository.save(newItem);
    }

    return this.getCart(userId);
  }

  async updateItem(userId: number, itemId: number, dto: UpdateCartItemDto) {
    const item = await this.cartItemRepository.findOne({
      where: { id: itemId },
      relations: ['cart'],
    });

    if (!item || item.cart.user_id !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    if (item.quantity !== dto.quantity) {
      item.quantity = dto.quantity;
      await this.cartItemRepository.save(item);
    }

    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    const item = await this.cartItemRepository.findOne({
      where: { id: itemId },
      relations: ['cart'],
    });

    if (!item || item.cart.user_id !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartItemRepository.remove(item);

    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    const cart = await this.cartRepository.findOne({
      where: { user_id: userId },
      relations: ['items'],
    });

    if (cart && cart.items.length > 0) {
      await this.cartItemRepository.remove(cart.items);
    }
  }

  private async formatCartResponse(cart: Cart) {
    // Helper to format the cart response consistent with frontend expectations

    // Optimized: Fetch all prices in one go
    const priceGroups = await this.priceGroupService.getPricesForCartItems(
      cart.items.map((item) => ({
        productId: item.product.id,
        variantId: item.variant_id ?? null,
        variant: item.variant,
      })),
    );

    const items = cart.items.map((item, index) => {
      const primaryMedia = item.product?.media?.find((m) => m.is_primary);
      const firstMedia = item.product?.media?.[0];
      const image = primaryMedia?.url || firstMedia?.url || null;

      // Get Price (using pre-fetched array, index matches)
      const priceGroup = priceGroups[index];

      const regularPrice = priceGroup ? Number(priceGroup.price) : 0;
      const salePrice =
        priceGroup && priceGroup.sale_price !== null
          ? Number(priceGroup.sale_price)
          : null;

      // Format variant details if they exist
      let variantDetails: any = null;
      if (item.variant) {
        variantDetails = {
          id: item.variant.id,
          price: regularPrice,
          sale_price: salePrice,
          attributes:
            item.variant.combinations?.map((combo) => ({
              attribute_id: combo.attribute_value.attribute.id,
              attribute_name_en: combo.attribute_value.attribute.name_en,
              attribute_name_ar: combo.attribute_value.attribute.name_ar,
              value_id: combo.attribute_value.id,
              value_en: combo.attribute_value.value_en,
              value_ar: combo.attribute_value.value_ar,
              color_code: combo.attribute_value.color_code, // If it's a color attribute
            })) || [],
        };
      }

      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        product: {
          id: item.product.id,
          name_en: item.product.name_en,
          name_ar: item.product.name_ar,
          price: regularPrice,
          sale_price: salePrice,
          image: image,
        },
        variant: variantDetails,
      };
    });

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => {
      // price is now the regular price, we need to check if there is a sale price
      const price =
        item.product.sale_price !== null
          ? Number(item.product.sale_price)
          : Number(item.product.price);
      return sum + price * item.quantity;
    }, 0);

    return {
      id: cart.id,
      user_id: cart.user_id,
      items,
      total_amount: totalAmount,
    };
  }
}
