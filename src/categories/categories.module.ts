import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { Category } from './entities/category.entity';
import { CategoryUrl } from './entities/category-url.entity';
import { Product } from '../products/entities/product.entity';
import { ProductCategory } from '../products/entities/product-category.entity';
import { ProductsModule } from '../products/products.module';
import { Attribute } from '../attributes/entities/attribute.entity';
import { Specification } from '../specifications/entities/specification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      CategoryUrl,
      Product,
      ProductCategory,
      Attribute,
      Specification,
    ]),
    ProductsModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
