import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { RatingsModule } from './ratings/ratings.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { WalletModule } from './wallet/wallet.module';
import { CouponsModule } from './coupons/coupons.module';
import { AttributesModule } from './attributes/attributes.module';
import { VendorsModule } from './vendors/vendors.module';
import { MediaModule } from './media/media.module';
import { BannersModule } from './banners/banners.module';
import { HomeModule } from './home/home.module';
import { BrandsModule } from './brands/brands.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { AddressesModule } from './addresses/addresses.module';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: Number(process.env.CACHE_TTL ?? 60),
      max: Number(process.env.CACHE_MAX ?? 500),
    }),
    CommonModule,
    HealthModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME,
      password: String(process.env.DB_PASSWORD),
      database: process.env.DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
      logging: true,
      ssl: true,
      extra: {
        ssl: {
          rejectUnauthorized: false,
        },
      },
    }),
    UsersModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    RatingsModule,
    WishlistModule,
    OrdersModule,
    WalletModule,
    CouponsModule,
    AttributesModule,
    VendorsModule,
    MediaModule,
    BannersModule,
    HomeModule,
    BrandsModule,
    AddressesModule,
    CartModule,
  ],
})
export class AppModule {}
