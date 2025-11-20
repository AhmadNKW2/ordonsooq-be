import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductPricing } from './entities/product-pricing.entity';
import { ProductVariantPricing } from './entities/product-variant-pricing.entity';
import { ProductMedia } from './entities/product-media.entity';
import { ProductVariantMedia } from './entities/product-variant-media.entity';
import { ProductWeight } from './entities/product-weight.entity';
import { ProductVariantWeight } from './entities/product-variant-weight.entity';
import { ProductVariantStock } from './entities/product-variant-stock.entity';
import { AttributesModule } from '../attributes/attributes.module';
import { ProductVariantsService } from './product-variants.service';
import { ProductPricingService } from './product-pricing.service';
import { ProductMediaService } from './product-media.service';
import { ProductWeightService } from './product-weight.service';
import { ProductVariantDataService } from './product-variant-data.service';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductAttribute,
      ProductPricing,
      ProductVariantPricing,
      ProductMedia,
      ProductVariantMedia,
      ProductWeight,
      ProductVariantWeight,
      ProductVariantStock,
      AttributeValue,
    ]),
    AttributesModule,
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductVariantsService,
    ProductPricingService,
    ProductMediaService,
    ProductWeightService,
    ProductVariantDataService,
  ],
  exports: [
    ProductsService,
    ProductVariantsService,
    ProductPricingService,
    ProductMediaService,
    ProductWeightService,
    ProductVariantDataService,
  ],
})
export class ProductsModule { }