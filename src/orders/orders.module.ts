import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductStock } from '../products/entities/product-stock.entity';
import { CouponsModule } from '../coupons/coupons.module';
import { WalletModule } from '../wallet/wallet.module';
import { ProductsModule } from '../products/products.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order, 
      OrderItem, 
      Product,
      ProductVariant,
      ProductStock
    ]),
    CouponsModule,
    WalletModule,
    ProductsModule,
    CartModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
