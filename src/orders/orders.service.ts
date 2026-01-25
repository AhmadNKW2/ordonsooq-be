import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import {
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductStock } from '../products/entities/product-stock.entity';
import { CouponsService } from '../coupons/coupons.service';
import { WalletService } from '../wallet/wallet.service';
import { ProductPriceGroupService } from '../products/product-price-group.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { User } from '../users/entities/user.entity';
import { TransactionSource } from '../wallet/entities/wallet-transaction.entity';
import { CartService } from '../cart/cart.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private variantsRepository: Repository<ProductVariant>,
    @InjectRepository(ProductStock)
    private stockRepository: Repository<ProductStock>,
    private couponsService: CouponsService,
    private walletService: WalletService,
    private priceGroupService: ProductPriceGroupService,
    private cartService: CartService,
    private dataSource: DataSource,
  ) {}

  async create(user: User, createOrderDto: CreateOrderDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Process items, validate stock, calculate subtotal
      let subtotalAmount = 0;
      const orderItemsToCreate: any[] = [];

      for (const itemDto of createOrderDto.items) {
        const product = await queryRunner.manager.findOne(Product, {
          where: { id: itemDto.productId },
        });

        if (!product) {
          throw new NotFoundException(
            `Product #${itemDto.productId} not found`,
          );
        }

        // Check availability
        if (!product.visible || product.status !== 'active') {
          throw new BadRequestException(
            `Product #${product.name_en} is not available`,
          );
        }

        let variant: ProductVariant | null = null;
        if (itemDto.variantId) {
          variant = await queryRunner.manager.findOne(ProductVariant, {
            where: { id: itemDto.variantId, product_id: product.id },
          });
          if (!variant) {
            throw new NotFoundException(
              `Variant #${itemDto.variantId} not found for product`,
            );
          }
          if (!variant.is_active) {
            throw new BadRequestException(`Variant is not active`);
          }
        }

        // Check Stock with Lock
        const stock = await queryRunner.manager.findOne(ProductStock, {
          where: {
            product_id: product.id,
            variant_id: itemDto.variantId || IsNull(),
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (!stock || stock.quantity < itemDto.quantity) {
          throw new BadRequestException(
            `Insufficient stock for product ${product.name_en}`,
          );
        }

        // Get Price
        const priceGroup = await this.priceGroupService.getPriceForVariant(
          product.id,
          itemDto.variantId,
        );
        if (!priceGroup) {
          throw new BadRequestException(
            `Price not found for product ${product.name_en}`,
          );
        }

        const unitPrice =
          priceGroup.sale_price !== null && Number(priceGroup.sale_price) > 0
            ? Number(priceGroup.sale_price)
            : Number(priceGroup.price);

        const itemTotal = unitPrice * itemDto.quantity;
        subtotalAmount += itemTotal;

        orderItemsToCreate.push({
          product,
          variant,
          vendorId: product.vendor_id,
          quantity: itemDto.quantity,
          price: unitPrice,
          totalPrice: itemTotal,
          productSnapshot: {
            name_en: product.name_en,
            name_ar: product.name_ar,
            sku: product.sku,
          },
        });

        // Decrement Stock
        stock.quantity -= itemDto.quantity;
        await queryRunner.manager.save(stock);
      }

      let discountAmount = 0;
      let couponId: number | null = null;

      // 2. Apply Coupon
      if (createOrderDto.couponCode) {
        try {
          const validation = await this.couponsService.validateCoupon(user.id, {
            code: createOrderDto.couponCode,
            orderAmount: subtotalAmount,
          });

          // Extract data from response structure: { data: { coupon, discountAmount, ... }, message: ... }
          const data = validation['data'];
          discountAmount = Number(data.discountAmount);
          couponId = Number(data.coupon.id);
        } catch (e) {
          throw new BadRequestException(e.message || 'Invalid coupon');
        }
      }

      // 3. Totals
      const taxAmount = 0;
      const shippingAmount = 0;

      const totalAmount =
        subtotalAmount + taxAmount + shippingAmount - discountAmount;

      if (totalAmount < 0)
        throw new BadRequestException('Total amount cannot be negative');

      // 4. Payment
      let paymentStatus = PaymentStatus.PENDING;

      if (createOrderDto.paymentMethod === PaymentMethod.WALLET) {
        // Check/Deduct wallet
        await this.walletService.deductFunds(
          user.id,
          totalAmount,
          TransactionSource.PURCHASE,
          'Order Payment',
          undefined,
          queryRunner.manager,
        );
        paymentStatus = PaymentStatus.PAID;
      }

      // 5. Create Order
      const order = this.ordersRepository.create({
        userId: user.id,
        status: OrderStatus.PENDING,
        subtotalAmount,
        taxAmount,
        shippingAmount,
        discountAmount,
        totalAmount,
        couponId,
        shippingAddress: createOrderDto.shippingAddress,
        billingAddress:
          createOrderDto.billingAddress || createOrderDto.shippingAddress,
        paymentMethod: createOrderDto.paymentMethod,
        paymentStatus: paymentStatus,
        notes: createOrderDto.notes,
      });

      const savedOrder = await queryRunner.manager.save(Order, order);

      // 6. Create Order Items
      for (const itemData of orderItemsToCreate) {
        const orderItem = this.orderItemsRepository.create({
          orderId: savedOrder.id,
          productId: itemData.product.id,
          variantId: itemData.variant ? itemData.variant.id : null,
          vendorId: itemData.vendorId,
          quantity: itemData.quantity,
          price: itemData.price,
          totalPrice: itemData.totalPrice,
          productSnapshot: itemData.productSnapshot,
        });
        await queryRunner.manager.save(OrderItem, orderItem);
      }

      // 7. Record Coupon Usage
      if (couponId) {
        await this.couponsService.applyCoupon(
          user.id,
          couponId,
          String(savedOrder.id),
          discountAmount,
          queryRunner.manager,
        );
      }

      await queryRunner.commitTransaction();

      // Clear Cart
      try {
        await this.cartService.clearCart(user.id);
      } catch (err) {
        console.error('Failed to clear cart after order:', err);
      }

      return this.findOne(savedOrder.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findOne(id: number) {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'items.variant', 'user'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findAll(userId: number) {
    return this.ordersRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['items', 'items.product'],
    });
  }

  async cancel(id: number, userId: number) {
    const order = await this.findOne(id);
    if (order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Restore Stock
      for (const item of order.items) {
        const stock = await queryRunner.manager.findOne(ProductStock, {
          where: {
            product_id: item.productId,
            variant_id: item.variantId || IsNull(),
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (stock) {
          stock.quantity += item.quantity;
          await queryRunner.manager.save(stock);
        }
      }

      // Refund Wallet
      if (
        order.paymentMethod === PaymentMethod.WALLET &&
        order.paymentStatus === PaymentStatus.PAID
      ) {
        await this.walletService.addFunds(
          order.userId,
          {
            amount: order.totalAmount,
            source: TransactionSource.REFUND,
            description: `Refund for Order #${order.id}`,
          },
          queryRunner.manager,
        );
      }

      order.status = OrderStatus.CANCELLED;
      await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateStatus(id: number, status: OrderStatus) {
    const order = await this.findOne(id);
    order.status = status;
    return this.ordersRepository.save(order);
  }
}
