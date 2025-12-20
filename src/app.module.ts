import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
    WalletModule,
    CouponsModule,
    AttributesModule,
    VendorsModule,
    MediaModule,
    BannersModule,
    HomeModule,
    BrandsModule,
  ],
})
export class AppModule {}
