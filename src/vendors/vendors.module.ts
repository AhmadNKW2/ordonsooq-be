import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { Vendor } from './entities/vendor.entity';
import { Product } from '../products/entities/product.entity';
import { ProductsModule } from '../products/products.module';
import { Category } from '../categories/entities/category.entity';
import { VendorCategory } from './entities/vendor-category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vendor, Product, Category, VendorCategory]),
    forwardRef(() => ProductsModule),
  ],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
