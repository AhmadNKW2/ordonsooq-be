import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, PricingType } from './entities/product.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductPricing } from './entities/product-pricing.entity';
import { ProductVariantPricing } from './entities/product-variant-pricing.entity';
import { ProductMedia } from './entities/product-media.entity';
import { ProductVariantMedia } from './entities/product-variant-media.entity';
import { ProductWeight } from './entities/product-weight.entity';
import { ProductVariantWeight } from './entities/product-variant-weight.entity';
import { ProductVariantStock } from './entities/product-variant-stock.entity';
import { AttributeValue } from '../attributes/entities/attribute-value.entity';

export interface VariantDataResponse {
  pricing: {
    cost?: number;
    price: number;
    sale_price?: number;
  } | null;
  media: Array<{
    id: number;
    url: string;
    type: string;
    is_primary: boolean;
    sort_order: number;
  }>;
  weight: {
    weight: number;
    length?: number;
    width?: number;
    height?: number;
  } | null;
  stock: {
    available: boolean;
    quantity: number;
  };
}

@Injectable()
export class ProductVariantDataService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductAttribute)
    private productAttributeRepository: Repository<ProductAttribute>,
    @InjectRepository(ProductPricing)
    private pricingRepository: Repository<ProductPricing>,
    @InjectRepository(ProductVariantPricing)
    private variantPricingRepository: Repository<ProductVariantPricing>,
    @InjectRepository(ProductMedia)
    private mediaRepository: Repository<ProductMedia>,
    @InjectRepository(ProductVariantMedia)
    private variantMediaRepository: Repository<ProductVariantMedia>,
    @InjectRepository(ProductWeight)
    private weightRepository: Repository<ProductWeight>,
    @InjectRepository(ProductVariantWeight)
    private variantWeightRepository: Repository<ProductVariantWeight>,
    @InjectRepository(ProductVariantStock)
    private variantStockRepository: Repository<ProductVariantStock>,
    @InjectRepository(AttributeValue)
    private attributeValueRepository: Repository<AttributeValue>,
  ) {}

  /**
   * Get variant data for customer based on selected attribute values
   * @param productId - The product ID
   * @param selectedAttributes - Object like { "Color": "Red", "Size": "Large", "RAM": "8GB" }
   */
  async getVariantData(
    productId: number,
    selectedAttributes: Record<string, string>,
  ): Promise<VariantDataResponse> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    const productAttributes = await this.productAttributeRepository.find({
      where: { product_id: productId },
      relations: ['attribute'],
    });

    // Fetch pricing
    const pricing = await this.fetchPricing(
      product,
      productAttributes,
      selectedAttributes,
    );

    // Fetch media
    const media = await this.fetchMedia(
      product,
      productAttributes,
      selectedAttributes,
    );

    // Fetch weight
    const weight = await this.fetchWeight(
      product,
      productAttributes,
      selectedAttributes,
    );

    // Fetch stock
    const stock = await this.fetchStock(
      product,
      selectedAttributes,
    );

    return {
      pricing,
      media,
      weight,
      stock,
    };
  }

  /**
   * Fetch pricing based on product type and attributes
   */
  private async fetchPricing(
    product: Product,
    productAttributes: ProductAttribute[],
    selectedAttributes: Record<string, string>,
  ): Promise<VariantDataResponse['pricing']> {
    if (product.pricing_type === PricingType.SINGLE) {
      const pricing = await this.pricingRepository.findOne({
        where: { product_id: product.id },
      });

      if (!pricing) return null;

      return {
        cost: pricing.cost,
        price: pricing.price,
        sale_price: pricing.sale_price,
      };
    }

    // Variant pricing - find which attribute controls pricing
    const pricingAttribute = productAttributes.find((pa) => pa.controls_pricing);

    if (!pricingAttribute) return null;

    const pricingAttributeName = pricingAttribute.attribute.name_en;
    const selectedValue = selectedAttributes[pricingAttributeName];

    if (!selectedValue) return null;

    // Find attribute value ID
    const attributeValue = await this.attributeValueRepository.findOne({
      where: {
        attribute_id: pricingAttribute.attribute_id,
        value_en: selectedValue,
      },
    });

    if (!attributeValue) return null;

    // Get variant pricing
    const pricing = await this.variantPricingRepository.findOne({
      where: {
        product_id: product.id,
        attribute_value_id: attributeValue.id,
      },
    });

    if (!pricing) return null;

    return {
      cost: pricing.cost,
      price: pricing.price,
      sale_price: pricing.sale_price,
    };
  }

  /**
   * Fetch media based on attributes
   */
  private async fetchMedia(
    product: Product,
    productAttributes: ProductAttribute[],
    selectedAttributes: Record<string, string>,
  ): Promise<VariantDataResponse['media']> {
    // Check if any attribute controls media
    const mediaAttribute = productAttributes.find((pa) => pa.controls_media);

    if (!mediaAttribute) {
      // No variant-based media, return general product media
      const media = await this.mediaRepository.find({
        where: { product_id: product.id },
        order: { sort_order: 'ASC', id: 'ASC' },
      });

      return media.map((m) => ({
        id: m.id,
        url: m.url,
        type: m.type,
        is_primary: m.is_primary,
        sort_order: m.sort_order,
      }));
    }

    const mediaAttributeName = mediaAttribute.attribute.name_en;
    const selectedValue = selectedAttributes[mediaAttributeName];

    if (!selectedValue) return [];

    // Find attribute value ID
    const attributeValue = await this.attributeValueRepository.findOne({
      where: {
        attribute_id: mediaAttribute.attribute_id,
        value_en: selectedValue,
      },
    });

    if (!attributeValue) return [];

    // Get variant media
    const media = await this.variantMediaRepository.find({
      where: {
        product_id: product.id,
        attribute_value_id: attributeValue.id,
      },
      order: { sort_order: 'ASC', id: 'ASC' },
    });

    return media.map((m) => ({
      id: m.id,
      url: m.url,
      type: m.type,
      is_primary: m.is_primary,
      sort_order: m.sort_order,
    }));
  }

  /**
   * Fetch weight based on attributes
   */
  private async fetchWeight(
    product: Product,
    productAttributes: ProductAttribute[],
    selectedAttributes: Record<string, string>,
  ): Promise<VariantDataResponse['weight']> {
    // Check if any attribute controls weight
    const weightAttribute = productAttributes.find((pa) => pa.controls_weight);

    if (!weightAttribute) {
      // No variant-based weight, return general product weight
      const weight = await this.weightRepository.findOne({
        where: { product_id: product.id },
      });

      if (!weight) return null;

      return {
        weight: weight.weight,
        length: weight.length,
        width: weight.width,
        height: weight.height,
      };
    }

    const weightAttributeName = weightAttribute.attribute.name_en;
    const selectedValue = selectedAttributes[weightAttributeName];

    if (!selectedValue) return null;

    // Find attribute value ID
    const attributeValue = await this.attributeValueRepository.findOne({
      where: {
        attribute_id: weightAttribute.attribute_id,
        value_en: selectedValue,
      },
    });

    if (!attributeValue) return null;

    // Get variant weight
    const weight = await this.variantWeightRepository.findOne({
      where: {
        product_id: product.id,
        attribute_value_id: attributeValue.id,
      },
    });

    if (!weight) return null;

    return {
      weight: weight.weight,
      length: weight.length,
      width: weight.width,
      height: weight.height,
    };
  }

  /**
   * Fetch stock for specific variant combination
   */
  private async fetchStock(
    product: Product,
    selectedAttributes: Record<string, string>,
  ): Promise<VariantDataResponse['stock']> {
    if (product.pricing_type === PricingType.SINGLE) {
      // For single pricing products, check if there's a general stock entry
      // or return a default available status
      return { available: true, quantity: 0 };
    }

    // For variant products, find exact combination
    const stock = await this.variantStockRepository.findOne({
      where: {
        product_id: product.id,
        combination: selectedAttributes as any,
      },
    });

    if (!stock) {
      return { available: false, quantity: 0 };
    }

    return {
      available: stock.quantity > 0,
      quantity: stock.quantity,
    };
  }
}
