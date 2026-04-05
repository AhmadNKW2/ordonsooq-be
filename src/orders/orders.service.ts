import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { CouponsService } from '../coupons/coupons.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FilterOrderDto } from './dto/filter-order.dto';
import { UpdateOrderItemsCostDto } from './dto/update-order-items-cost.dto';
import { User } from '../users/entities/user.entity';
import { TransactionSource } from '../wallet/entities/wallet-transaction.entity';
import { CartService } from '../cart/cart.service';

// ... imports

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    private couponsService: CouponsService,
    private walletService: WalletService,
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

      // Sort items by productId and variantId to avoid deadlocks
      const sortedItems = [...createOrderDto.items].sort((a, b) => {
        if (a.productId !== b.productId) {
          return a.productId - b.productId;
        }
        const aVariant = a.variantId || 0;
        const bVariant = b.variantId || 0;
        return aVariant - bVariant;
      });

      for (const itemDto of sortedItems) {
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

        // Check stock
        if (product.is_out_of_stock) {
          throw new BadRequestException(
            `Insufficient stock for product ${product.name_en}`,
          );
        }

        // Get price directly from product
        const unitPrice =
          product.sale_price !== null && Number(product.sale_price) > 0
            ? Number(product.sale_price)
            : Number(product.price);

        const itemTotal = unitPrice * itemDto.quantity;
        subtotalAmount += itemTotal;

        orderItemsToCreate.push({
          product,
          variant: null,
          vendorId: product.vendor_id,
          quantity: itemDto.quantity,
          price: unitPrice,
          cost: itemDto.cost ?? product.cost ?? 0,
          totalPrice: itemTotal,
          productSnapshot: {
            name_en: product.name_en,
            name_ar: product.name_ar,
            sku: product.sku,
          },
        });

        // Note: Stock decrement string removed temporarily since actual stock is unknown
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
          cost: itemData.cost, // Calculated at time of purchase
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
      relations: ['items', 'items.product', 'user'],
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

  async findAllAdmin(filterDto: FilterOrderDto) {
    const { status, page = 1, limit = 10, search } = filterDto;
    const skip = (page - 1) * limit;

    const query = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .skip(skip)
      .take(limit)
      .orderBy('order.createdAt', 'DESC');

    if (status) {
      query.andWhere('order.status = :status', { status });
    }

    if (search) {
      query.andWhere(
        '(CAST(order.id AS TEXT) LIKE :search OR user.email ILIKE :search OR user.firstName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async cancel(id: number, userId: number) {
    const order = await this.findOne(id);
    if (order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    return this.processCancellation(order, OrderStatus.CANCELLED);
  }

  async updateStatus(id: number, status: OrderStatus) {
    const order = await this.findOne(id);

    if (order.status === status) return order;

    // Handle Cancellation/Refund by Admin
    if (status === OrderStatus.CANCELLED || status === OrderStatus.REFUNDED) {
      return this.processCancellation(order, status);
    }

    // Handle normal transitions
    order.status = status;

    // If delivering, maybe handle COD payment?
    if (
      status === OrderStatus.DELIVERED &&
      order.paymentMethod === PaymentMethod.COD
    ) {
      order.paymentStatus = PaymentStatus.PAID;
    }

    return this.ordersRepository.save(order);
  }

  async updateItemsCost(orderId: number, dto: UpdateOrderItemsCostDto) {
    const order = await this.findOne(orderId);

    const itemMap = new Map(order.items.map((i) => [i.id, i]));

    const toSave: OrderItem[] = [];
    for (const entry of dto.items) {
      const item = itemMap.get(entry.itemId);
      if (!item) {
        throw new NotFoundException(
          `Order item #${entry.itemId} not found in order #${orderId}`,
        );
      }
      item.cost = entry.cost;
      toSave.push(item);
    }

    await this.orderItemsRepository.save(toSave);
    return this.findOne(orderId);
  }

  private async processCancellation(order: Order, newStatus: OrderStatus) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Restore Stock
      for (const item of order.items) {
        if (item.productId) {
          const product = await queryRunner.manager.findOne(Product, {
            where: { id: item.productId },
            lock: { mode: 'pessimistic_write' },
          });

          if (product) {
            product.quantity += item.quantity;
            await queryRunner.manager.save(product);
          }
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
        order.paymentStatus = PaymentStatus.REFUNDED;
      }

      order.status = newStatus;
      await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      return this.findOne(order.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
