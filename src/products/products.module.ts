import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductPriceGroup } from './entities/product-price-group.entity';
import { ProductPriceGroupValue } from './entities/product-price-group-value.entity';
import { ProductMediaGroup } from './entities/product-media-group.entity';
import { ProductMediaGroupValue } from './entities/product-media-group-value.entity';
import { ProductWeightGroup } from './entities/product-weight-group.entity';
import { ProductWeightGroupValue } from './entities/product-weight-group-value.entity';
import { ProductStock } from './entities/product-stock.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductVariantCombination } from './entities/product-variant-combination.entity';
import { ProductCategory } from './entities/product-category.entity';
import { AttributesModule } from '../attributes/attributes.module';
import { ProductVariantsService } from './product-variants.service';
import { ProductPriceGroupService } from './product-price-group.service';
import { ProductMediaGroupService } from './product-media-group.service';
import { ProductWeightGroupService } from './product-weight-group.service';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';
import { Attribute } from '../attributes/entities/attribute.entity';
import { Media } from '../media/entities/media.entity';
import { Category } from '../categories/entities/category.entity';
import { Brand } from '../brands/entities/brand.entity';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductAttribute,
      ProductPriceGroup,
      ProductPriceGroupValue,
      ProductMediaGroup,
      ProductMediaGroupValue,
      ProductWeightGroup,
      ProductWeightGroupValue,
      ProductStock,
      ProductVariant,
      ProductVariantCombination,
      ProductCategory,
      AttributeValue,
      Attribute,
      Media,
      Category,
      Brand,
    ]),
    AttributesModule,
    SearchModule,
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductVariantsService,
    ProductPriceGroupService,
    ProductMediaGroupService,
    ProductWeightGroupService,
  ],
  exports: [
    ProductsService,
    ProductVariantsService,
    ProductPriceGroupService,
    ProductMediaGroupService,
    ProductWeightGroupService,
  ],
})
export class ProductsModule {}
