import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Product, ProductStatus } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductDto } from './dto/filter-product.dto';
import { ProductVariantsService } from './product-variants.service';
import { ProductPriceGroupService } from './product-price-group.service';
import { ProductMediaGroupService } from './product-media-group.service';
import { ProductWeightGroupService } from './product-weight-group.service';
import {
  Category,
  CategoryStatus,
} from '../categories/entities/category.entity';
import { ProductCategory } from './entities/product-category.entity';
import { Vendor, VendorStatus } from '../vendors/entities/vendor.entity';
import { Brand, BrandStatus } from '../brands/entities/brand.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(ProductCategory)
    private productCategoriesRepository: Repository<ProductCategory>,
    @InjectRepository(Brand)
    private brandsRepository: Repository<Brand>,
    private variantsService: ProductVariantsService,
    private priceGroupService: ProductPriceGroupService,
    private mediaGroupService: ProductMediaGroupService,
    private weightGroupService: ProductWeightGroupService,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateProductDto): Promise<any> {
    try {
      // Validate categories exist and are active
      if (dto.category_ids && dto.category_ids.length > 0) {
        const categories = await this.categoriesRepository.find({
          where: { id: In(dto.category_ids), status: CategoryStatus.ACTIVE },
        });
        if (categories.length !== dto.category_ids.length) {
          throw new BadRequestException(
            'One or more categories not found or are archived',
          );
        }
      }

      // Validate brand exists and is active if provided
      if (dto.brand_id !== undefined) {
        const brand = await this.brandsRepository.findOne({
          where: { id: dto.brand_id, status: BrandStatus.ACTIVE },
        });
        if (!brand) {
          throw new BadRequestException('Brand not found or inactive');
        }
      }

      // 1. Create basic product (primary category is first in the list)
      const product = this.productsRepository.create({
        name_en: dto.name_en,
        name_ar: dto.name_ar,
        sku: dto.sku,
        short_description_en: dto.short_description_en,
        short_description_ar: dto.short_description_ar,
        long_description_en: dto.long_description_en,
        long_description_ar: dto.long_description_ar,
        category_id: dto.category_ids?.[0],
        vendor_id: dto.vendor_id,
        brand_id: dto.brand_id,
        status: dto.status ?? ProductStatus.ACTIVE,
        visible: dto.visible ?? true,
      });
      const savedProduct = await this.productsRepository.save(product);

      // 2. Create product-category relationships
      if (dto.category_ids && dto.category_ids.length > 0) {
        const productCategories = dto.category_ids.map((categoryId) =>
          this.productCategoriesRepository.create({
            product_id: savedProduct.id,
            category_id: categoryId,
          }),
        );
        await this.productCategoriesRepository.save(productCategories);
      }

      // Determine if this is a variant product based on attributes
      const isVariantProduct = dto.attributes && dto.attributes.length > 0;

      // 3. Add attributes if provided
      if (dto.attributes && dto.attributes.length > 0) {
        await this.variantsService.addProductAttributes(
          savedProduct.id,
          dto.attributes.map((attr) => ({
            attribute_id: attr.attribute_id,
            controls_pricing: attr.controls_pricing,
            controls_media: attr.controls_media,
            controls_weight: attr.controls_weight,
          })),
        );
      }

      // 4. Handle prices (unified - works for both simple and variant)
      if (dto.prices && dto.prices.length > 0) {
        for (const priceItem of dto.prices) {
          const hasCombination =
            priceItem.combination &&
            Object.keys(priceItem.combination).length > 0;

          if (hasCombination) {
            await this.priceGroupService.findOrCreatePriceGroup(
              savedProduct.id,
              priceItem.combination!,
              {
                cost: priceItem.cost,
                price: priceItem.price,
                sale_price: priceItem.sale_price,
              },
            );
          } else {
            await this.priceGroupService.createSimplePriceGroup(
              savedProduct.id,
              {
                cost: priceItem.cost,
                price: priceItem.price,
                sale_price: priceItem.sale_price,
              },
            );
          }
        }
      }

      // 5. Handle weights (unified - works for both simple and variant)
      if (dto.weights && dto.weights.length > 0) {
        for (const weightItem of dto.weights) {
          const hasCombination =
            weightItem.combination &&
            Object.keys(weightItem.combination).length > 0;

          if (hasCombination) {
            await this.weightGroupService.findOrCreateWeightGroup(
              savedProduct.id,
              weightItem.combination!,
              {
                weight: weightItem.weight,
                length: weightItem.length,
                width: weightItem.width,
                height: weightItem.height,
              },
            );
          } else {
            await this.weightGroupService.createSimpleWeightGroup(
              savedProduct.id,
              {
                weight: weightItem.weight,
                length: weightItem.length,
                width: weightItem.width,
                height: weightItem.height,
              },
            );
          }
        }
      }

      // 6. Handle stocks (unified - works for both simple and variant)
      if (dto.stocks && dto.stocks.length > 0) {
        for (const stockItem of dto.stocks) {
          const hasCombination =
            stockItem.combination &&
            Object.keys(stockItem.combination).length > 0;

          if (hasCombination) {
            await this.variantsService.setStockByCombination(
              savedProduct.id,
              stockItem.combination!,
              stockItem.quantity,
            );
          } else {
            await this.variantsService.setSimpleStock(
              savedProduct.id,
              stockItem.quantity,
            );
          }
        }
      }

      // 7. Handle media (link pre-uploaded media to product)
      if (dto.media && dto.media.length > 0) {
        await this.mediaGroupService.syncProductMedia(
          savedProduct.id,
          dto.media,
        );
      }

      // Return the complete product
      const result = await this.findOne(savedProduct.id);
      return {
        product: result,
        message: isVariantProduct
          ? 'Product created successfully with variant configuration.'
          : 'Product created successfully.',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to create product: ${error.message}`,
      );
    }
  }

  async findAll(filterDto: FilterProductDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      categoryId,
      vendorId,
      brandId,
      minRating,
      maxRating,
      status,
      visible,
      search,
    } = filterDto;

    // NOTE: The list view previously did a huge multi-join + getManyAndCount.
    // With relations like media/variants/stock/groups, this causes row explosion and slow COUNT.
    // We optimize by:
    // 1) Building a lightweight base query for filters + count + paginated IDs
    // 2) Fetching full relations only for the page of product IDs

    const baseQuery = this.productsRepository
      .createQueryBuilder('product')
      .where('product.status = :activeStatus', {
        activeStatus: ProductStatus.ACTIVE,
      });

    // Filter by status (override default ACTIVE if specified)
    if (status !== undefined) {
      baseQuery.andWhere('product.status = :status', { status });
    }

    // Filter by visible
    if (visible !== undefined) {
      baseQuery.andWhere('product.visible = :visible', { visible });
    }

    // Filter by category (check in product_categories junction table)
    if (categoryId) {
      baseQuery.andWhere(
        'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = product.id AND pc.category_id = :categoryId)',
        { categoryId },
      );
    }

    // Filter by vendor
    if (vendorId) {
      baseQuery.andWhere('product.vendor_id = :vendorId', { vendorId });
    }

    // Filter by brand
    if (brandId) {
      baseQuery.andWhere('product.brand_id = :brandId', { brandId });
    }

    // Filter by rating range
    if (minRating !== undefined) {
      baseQuery.andWhere('product.average_rating >= :minRating', {
        minRating,
      });
    }
    if (maxRating !== undefined) {
      baseQuery.andWhere('product.average_rating <= :maxRating', {
        maxRating,
      });
    }

    // Search by name, sku, or descriptions
    if (search) {
      baseQuery.andWhere(
        '(product.name_en ILIKE :search OR product.name_ar ILIKE :search OR product.sku ILIKE :search OR product.short_description_en ILIKE :search OR product.long_description_en ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Count (fast because there are no row-exploding joins)
    const total = await baseQuery.getCount();

    // Fetch page IDs (fast)
    const idRows = await baseQuery
      .clone()
      .select('product.id', 'id')
      .orderBy(`product.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<{ id: number }>();

    const ids = idRows.map((r) => Number(r.id)).filter((id) => !Number.isNaN(id));

    if (ids.length === 0) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    // Load full relations only for products in this page
    const data = await this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.productCategories', 'productCategories')
      .leftJoinAndSelect('productCategories.category', 'categories')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.media', 'media')
      .leftJoinAndSelect('media.mediaGroup', 'mediaGroup')
      .leftJoinAndSelect('mediaGroup.groupValues', 'mediaGroupValues')
      .leftJoinAndSelect('product.stock', 'stock')
      .leftJoinAndSelect('product.priceGroups', 'priceGroups')
      .leftJoinAndSelect('priceGroups.groupValues', 'priceGroupValues')
      .leftJoinAndSelect('product.weightGroups', 'weightGroups')
      .leftJoinAndSelect('weightGroups.groupValues', 'weightGroupValues')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.combinations', 'combinations')
      .leftJoinAndSelect('combinations.attribute_value', 'attributeValue')
      .leftJoinAndSelect('attributeValue.attribute', 'comboAttribute')
      .leftJoinAndSelect('product.attributes', 'attributes')
      .leftJoinAndSelect('attributes.attribute', 'prodAttribute')
      .where('product.id IN (:...ids)', { ids })
      // Keep list ordering consistent with the requested sort
      .orderBy(`product.${sortBy}`, sortOrder)
      .getMany();

    // Transform each product to include primary_image and simplified structure
    const transformedData = data.map((product) =>
      this.transformProductListItem(product),
    );

    return {
      data: transformedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Transform a product for the list view with primary image and stock
   */
  private transformProductListItem(product: Product): any {
    const { 
      media, 
      priceGroups, 
      weightGroups,
      stock, 
      brand, 
      variants, 
      productCategories,
      ...rest 
    } = product as any;

    // --- Legacy/Card View Fields ---

    // Find primary image or first image
    const primaryImage =
      media?.find((m: any) => m.is_primary) || media?.[0] || null;

    // Get the base price (first price group with no combination or lowest price)
    const simplePrice = priceGroups?.find(
      (pg: any) => !pg.groupValues || pg.groupValues.length === 0,
    );
    const basePrice = simplePrice || priceGroups?.[0] || null;

    // Get total stock quantity
    const totalStock =
      stock?.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0) || 0;
    const hasStock = totalStock > 0;

    const brandInfo = brand
      ? {
          id: brand.id,
          name_en: brand.name_en,
          name_ar: brand.name_ar,
          logo: brand.logo,
          status: brand.status,
        }
      : null;

    // --- Full Details logic (similar to transformProductResponse) ---

    // Transform media to include mediaGroup object and remove media_group_id
    const transformedMedia =
      media?.map((m: any) => {
        const { media_group_id, mediaGroup, ...mediaRest } = m;
        return {
          ...mediaRest,
          media_group: mediaGroup
            ? {
                id: mediaGroup.id,
                product_id: mediaGroup.product_id,
                groupValues: mediaGroup.groupValues,
                created_at: mediaGroup.created_at,
                updated_at: mediaGroup.updated_at,
              }
            : null,
        };
      }) || [];

    // Transform productCategories to a clean categories array (if loaded)
    const categories =
      productCategories?.map((pc: any) => pc.category).filter(Boolean) || [];

    return {
      ...rest,
      brand: brandInfo,
      // Card view fields
      primary_image: primaryImage
        ? {
            id: primaryImage.id,
            url: primaryImage.url,
            type: primaryImage.type,
            alt_text: primaryImage.alt_text,
          }
        : null,
      price: basePrice?.price || null,
      sale_price: basePrice?.sale_price || null,
      
      // Full details fields
      categories,
      stock: stock || [], // Return detailed stock array, but also keep card view summary?
                          // Actually, the previous implementation returned an object {total_quantity, in_stock}
                          // Users might rely on that. Let's keep the SUMMARY object as `stock_summary` or just `stock`?
                          // The `transformProductResponse` returns `stock` as array. 
                          // The previous `transformProductListItem` returned `stock` as object.
                          // This is a conflict. 
                          // I'll return `stock` as the detailed array (like FindOne) and add `stock_summary` for the card view usage if needed?
                          // Or better: Use `stock` for the ARRAY (standard) and `total_quantity` / `in_stock` as top level fields?
                          // Comparing with previous `transformProductListItem`:
                          // stock: { total_quantity: ..., in_stock: ... }
                          // User requested "full details".
                          // I will return `stock` as the array (details) AND `stock_summary` for the convenience.
                          // Wait, checking user complaint: 
                          // "stock": { "total_quantity": 15, "in_stock": true } (This was present in list view)
                          // "stock": [ ... ] (This is present in detail view)
                          // I will overwrite `stock` with the array to match detail view, and move the summary to `stock_info` or similar?
                          // OR, since `stock` in detail view is an array, I should probably output the array to be consistent with "full details".
                          
      stock_summary: {
        total_quantity: totalStock,
        in_stock: hasStock,
      },
      
      variants: variants || [],
      variants_ids: variants?.map((v: any) => v.id) || [],
      
      prices: priceGroups || [],
      weights: weightGroups || [],
      media: transformedMedia,
    };
  }

  async findOne(id: number): Promise<any> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relationLoadStrategy: 'query',
      relations: [
        'category',
        'productCategories',
        'productCategories.category',
        'vendor',
        'brand',
        'media',
        'media.mediaGroup',
        'media.mediaGroup.groupValues',
        'priceGroups',
        'priceGroups.groupValues',
        'weightGroups',
        'weightGroups.groupValues',
        'stock',
        'variants',
        'variants.combinations',
        'attributes',
        'attributes.attribute',
      ],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.transformProductResponse(product);
  }

  /**
   * Transform product response:
   * - Rename priceGroups to prices
   * - Rename weightGroups to weights
   * - Include mediaGroup object in each media item (remove media_group_id)
   * - Transform productCategories to categories array
   */
  private transformProductResponse(product: Product): any {
    const {
      priceGroups,
      weightGroups,
      media,
      productCategories,
      category,
      brand,
      ...rest
    } = product as any;

    // Transform media to include mediaGroup object and remove media_group_id
    const transformedMedia =
      media?.map((m: any) => {
        const { media_group_id, mediaGroup, ...mediaRest } = m;
        return {
          ...mediaRest,
          media_group: mediaGroup
            ? {
                id: mediaGroup.id,
                product_id: mediaGroup.product_id,
                groupValues: mediaGroup.groupValues,
                created_at: mediaGroup.created_at,
                updated_at: mediaGroup.updated_at,
              }
            : null,
        };
      }) || [];

    // Transform productCategories to a clean categories array
    const categories =
      productCategories?.map((pc: any) => pc.category).filter(Boolean) || [];

    const brandInfo = brand
      ? {
          id: brand.id,
          name_en: brand.name_en,
          name_ar: brand.name_ar,
          logo: brand.logo,
          status: brand.status,
        }
      : null;

    return {
      ...rest,
      brand: brandInfo,
      categories,
      media: transformedMedia,
      prices: priceGroups || [],
      weights: weightGroups || [],
    };
  }

  /**
   * Comprehensive update method for products
   * The payload represents the COMPLETE state of the product.
   * Anything not in the payload will be deleted.
   */
  async update(id: number, dto: UpdateProductDto): Promise<any> {
    // Lightweight check for existence
    const exists = await this.productsRepository.count({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Product not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate and update categories
      if (dto.category_ids && dto.category_ids.length > 0) {
        const categories = await this.categoriesRepository.find({
          where: { id: In(dto.category_ids), status: CategoryStatus.ACTIVE },
        });
        if (categories.length !== dto.category_ids.length) {
          throw new BadRequestException(
            'One or more categories not found or are archived',
          );
        }

        // Delete existing product-category relationships
        await queryRunner.manager.delete(ProductCategory, { product_id: id });

        // Create new product-category relationships
        const productCategories = dto.category_ids.map((categoryId) =>
          this.productCategoriesRepository.create({
            product_id: id,
            category_id: categoryId,
          }),
        );
        await queryRunner.manager.save(ProductCategory, productCategories);

        // Update primary category (first in the list)
        await queryRunner.manager.update(Product, id, {
          category_id: dto.category_ids[0],
        });
      }

      // Validate brand if provided
      if (dto.brand_id !== undefined) {
        if (dto.brand_id === (null as any)) {
          // noop - DTO type doesn't allow null, but guard for safety
        } else {
          const brand = await this.brandsRepository.findOne({
            where: { id: dto.brand_id, status: BrandStatus.ACTIVE },
          });
          if (!brand) {
            throw new BadRequestException('Brand not found or inactive');
          }
        }
      }

      // 2. Update basic product information
      const basicInfoFields = [
        'name_en',
        'name_ar',
        'sku',
        'short_description_en',
        'short_description_ar',
        'long_description_en',
        'long_description_ar',
        'vendor_id',
        'brand_id',
        'status',
        'visible',
      ];
      const basicInfoChanges: any = {};

      basicInfoFields.forEach((field) => {
        if (dto[field] !== undefined) {
          basicInfoChanges[field] = dto[field];
        }
      });

      if (Object.keys(basicInfoChanges).length > 0) {
        await queryRunner.manager.update(Product, id, basicInfoChanges);
      }

      // Commit transaction for basic info before calling other services
      // Note: Ideally, other services should accept queryRunner to participate in the transaction
      // For now, we commit here to ensure basic info is saved, but this is a partial optimization
      // To fully optimize, we would need to refactor all child services to accept a transaction manager
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Failed to update product: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }

    // Continue with other updates (outside transaction for now as services don't support it yet)
    try {
      // 3. Handle media - sync media IDs (add new, remove missing)
      if (dto.media !== undefined) {
        await this.mediaGroupService.syncProductMedia(id, dto.media || []);
      }

      // 4. Handle attributes - REPLACE all existing with new ones
      // First, delete all existing variants (which depend on attributes)
      await this.variantsService.deleteAllVariantsForProduct(id);

      // Delete all existing attributes
      await this.variantsService.deleteAllAttributesForProduct(id);

      // Add new attributes if provided
      if (dto.attributes && dto.attributes.length > 0) {
        await this.variantsService.addProductAttributes(id, dto.attributes);
      }

      // 5. Handle prices - REPLACE all existing with new ones
      await this.priceGroupService.deletePriceGroupsForProduct(id);

      if (dto.prices && dto.prices.length > 0) {
        // Separate simple prices from combination prices
        const simplePrices = dto.prices.filter(
          (p) => !p.combination || Object.keys(p.combination).length === 0,
        );
        const combinationPrices = dto.prices.filter(
          (p) => p.combination && Object.keys(p.combination).length > 0,
        );

        // Process simple prices (usually just one)
        if (simplePrices.length > 0) {
          await Promise.all(
            simplePrices.map((p) =>
              this.priceGroupService.createSimplePriceGroup(id, {
                cost: p.cost,
                price: p.price,
                sale_price: p.sale_price,
              }),
            ),
          );
        }

        // Process combination prices in parallel
        if (combinationPrices.length > 0) {
          await Promise.all(
            combinationPrices.map((p) =>
              this.priceGroupService.findOrCreatePriceGroup(
                id,
                p.combination!,
                {
                  cost: p.cost,
                  price: p.price,
                  sale_price: p.sale_price,
                },
              ),
            ),
          );
        }
      }

      // 5. Handle weights - REPLACE all existing with new ones
      await this.weightGroupService.deleteWeightGroupsForProduct(id);

      if (dto.weights && dto.weights.length > 0) {
        const simpleWeights = dto.weights.filter(
          (w) => !w.combination || Object.keys(w.combination).length === 0,
        );
        const combinationWeights = dto.weights.filter(
          (w) => w.combination && Object.keys(w.combination).length > 0,
        );

        if (simpleWeights.length > 0) {
          await Promise.all(
            simpleWeights.map((w) =>
              this.weightGroupService.createSimpleWeightGroup(id, {
                weight: w.weight,
                length: w.length,
                width: w.width,
                height: w.height,
              }),
            ),
          );
        }

        if (combinationWeights.length > 0) {
          await Promise.all(
            combinationWeights.map((w) =>
              this.weightGroupService.findOrCreateWeightGroup(
                id,
                w.combination!,
                {
                  weight: w.weight,
                  length: w.length,
                  width: w.width,
                  height: w.height,
                },
              ),
            ),
          );
        }
      }

      // 6. Handle stocks - REPLACE all existing with new ones
      await this.variantsService.deleteAllStocksForProduct(id);

      if (dto.stocks && dto.stocks.length > 0) {
        const simpleStocks = dto.stocks.filter(
          (s) => !s.combination || Object.keys(s.combination).length === 0,
        );
        const combinationStocks = dto.stocks.filter(
          (s) => s.combination && Object.keys(s.combination).length > 0,
        );

        if (simpleStocks.length > 0) {
          await Promise.all(
            simpleStocks.map((s) =>
              this.variantsService.setSimpleStock(id, s.quantity),
            ),
          );
        }

        if (combinationStocks.length > 0) {
          await Promise.all(
            combinationStocks.map((s) =>
              this.variantsService.setStockByCombination(
                id,
                s.combination!,
                s.quantity,
              ),
            ),
          );
        }
      }

      // Return updated product
      const updatedProduct = await this.findOne(id);
      return {
        product: updatedProduct,
        message: 'Product updated successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to update product: ${error.message}`,
      );
    }
  }

  // Update average rating (called when rating is added/updated)
  async updateAverageRating(product_id: number): Promise<void> {
    const result = await this.productsRepository
      .createQueryBuilder('product')
      .leftJoin('product.ratings', 'rating')
      .where('product.id = :product_id', { product_id })
      .andWhere('rating.status = :status', { status: 'approved' })
      .select('AVG(rating.rating)', 'avg')
      .addSelect('COUNT(rating.id)', 'count')
      .getRawOne();

    await this.productsRepository.update(product_id, {
      average_rating: parseFloat(result.avg) || 0,
      total_ratings: parseInt(result.count) || 0,
    });
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  /**
   * Archive a product (soft delete)
   * Sets status to ARCHIVED, preserves visible flag for when restored
   */
  async archive(id: number, userId: number): Promise<{ message: string }> {
    const product = await this.productsRepository.findOne({
      where: { id, status: ProductStatus.ACTIVE },
    });

    if (!product) {
      throw new NotFoundException('Product not found or already archived');
    }

    await this.productsRepository.update(id, {
      status: ProductStatus.ARCHIVED,
      archived_at: new Date(),
      archived_by: userId,
    });

    return { message: `Product "${product.name_en}" archived successfully` };
  }

  /**
   * Restore an archived product
   * - If the product's vendor is archived, restoration is blocked
   * - If the product's category is archived, a new category_id must be provided
   */
  async restore(
    id: number,
    newCategoryId?: number,
  ): Promise<{ message: string }> {
    const product = await this.productsRepository.findOne({
      where: { id, status: ProductStatus.ARCHIVED },
      relations: ['category', 'vendor'],
    });

    if (!product) {
      throw new NotFoundException('Product not found or not archived');
    }

    // Check if vendor is archived - block restoration if so
    if (product.vendor && product.vendor.status === VendorStatus.ARCHIVED) {
      throw new BadRequestException(
        `Cannot restore product because its vendor "${product.vendor.name_en}" is archived. ` +
          'Please restore the vendor first before restoring this product.',
      );
    }

    // Check if category is still active
    if (
      product.category &&
      product.category.status === CategoryStatus.ARCHIVED
    ) {
      if (!newCategoryId) {
        throw new BadRequestException(
          'Product category is archived. Please provide a new category_id to restore the product.',
        );
      }

      // Validate the new category exists and is active
      const newCategory = await this.categoriesRepository.findOne({
        where: { id: newCategoryId, status: CategoryStatus.ACTIVE },
      });

      if (!newCategory) {
        throw new BadRequestException(
          'The specified category does not exist or is archived',
        );
      }

      product.category_id = newCategoryId;
    }

    await this.productsRepository
      .createQueryBuilder()
      .update(Product)
      .set({
        status: ProductStatus.ACTIVE,
        category_id: product.category_id,
      })
      .where('id = :id', { id })
      .execute();

    // Set archived fields to null using raw query
    await this.productsRepository.query(
      'UPDATE products SET archived_at = NULL, archived_by = NULL WHERE id = $1',
      [id],
    );

    return { message: `Product "${product.name_en}" restored successfully` };
  }

  /**
   * Find all archived products with image and vendor details
   */
  async findArchived(filterDto: FilterProductDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'archived_at',
      sortOrder = 'DESC',
      categoryId,
      search,
    } = filterDto;

    const queryBuilder = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.media', 'media')
      .where('product.status = :status', { status: ProductStatus.ARCHIVED });

    // Filter by category
    if (categoryId) {
      queryBuilder.andWhere('product.category_id = :categoryId', {
        categoryId,
      });
    }

    // Search by name, sku, or descriptions
    if (search) {
      queryBuilder.andWhere(
        '(product.name_en ILIKE :search OR product.name_ar ILIKE :search OR product.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sorting
    const validSortColumn = [
      'archived_at',
      'created_at',
      'name_en',
      'name_ar',
    ].includes(sortBy)
      ? sortBy
      : 'archived_at';
    queryBuilder.orderBy(`product.${validSortColumn}`, sortOrder);

    // Pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [rawData, total] = await queryBuilder.getManyAndCount();

    // Map products to include image from primary media or first media
    const data = rawData.map((product) => {
      const primaryMedia = product.media?.find((m) => m.is_primary);
      const firstMedia = product.media?.[0];
      const image = primaryMedia?.url || firstMedia?.url || null;

      // Extract vendor info with status
      const vendorInfo = product.vendor
        ? {
            id: product.vendor.id,
            name_en: product.vendor.name_en,
            name_ar: product.vendor.name_ar,
            status: product.vendor.status,
            logo: product.vendor.logo,
          }
        : null;

      const { media, vendor, ...productData } = product;
      return {
        ...productData,
        image,
        vendor: vendorInfo,
      };
    });

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

  /**
   * Permanently delete a product (only if archived)
   * This is irreversible
   */
  async permanentDelete(id: number): Promise<{ message: string }> {
    const product = await this.productsRepository.findOne({
      where: { id, status: ProductStatus.ARCHIVED },
    });

    if (!product) {
      throw new NotFoundException(
        'Product not found or not archived. Only archived products can be permanently deleted.',
      );
    }

    await this.productsRepository.remove(product);

    return { message: `Product "${product.name_en}" permanently deleted` };
  }

  // ========== BULK ASSIGNMENT ==========

  /**
   * Assign multiple products to a specific category (adds to existing categories)
   */
  async assignProductsToCategory(
    categoryId: number,
    product_ids: number[],
  ): Promise<{ message: string; assigned: number; alreadyAssigned: number }> {
    // Validate category exists and is active
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId, status: CategoryStatus.ACTIVE },
    });

    if (!category) {
      throw new NotFoundException('Category not found or is archived');
    }

    // Get active products
    const products = await this.productsRepository.find({
      where: { id: In(product_ids), status: ProductStatus.ACTIVE },
    });

    if (products.length === 0) {
      throw new BadRequestException(
        'No active products found with the given IDs',
      );
    }

    // Check existing assignments
    const existingAssignments = await this.productCategoriesRepository.find({
      where: {
        product_id: In(products.map((p) => p.id)),
        category_id: categoryId,
      },
    });

    const existingProductIds = new Set(
      existingAssignments.map((a) => a.product_id),
    );
    const productsToAssign = products.filter(
      (p) => !existingProductIds.has(p.id),
    );

    // Create new assignments
    if (productsToAssign.length > 0) {
      const newAssignments = productsToAssign.map((product) =>
        this.productCategoriesRepository.create({
          product_id: product.id,
          category_id: categoryId,
        }),
      );
      await this.productCategoriesRepository.save(newAssignments);
    }

    return {
      message: `${productsToAssign.length} products assigned to category "${category.name_en}"`,
      assigned: productsToAssign.length,
      alreadyAssigned: existingAssignments.length,
    };
  }

  /**
   * Remove multiple products from a specific category
   */
  async removeProductsFromCategory(
    categoryId: number,
    product_ids: number[],
  ): Promise<{ message: string; removed: number }> {
    // Validate category exists
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Remove assignments
    const result = await this.productCategoriesRepository.delete({
      product_id: In(product_ids),
      category_id: categoryId,
    });

    return {
      message: `${result.affected} products removed from category "${category.name_en}"`,
      removed: result.affected || 0,
    };
  }

  /**
   * Assign multiple products to a specific vendor
   */
  async assignProductsToVendor(
    vendorId: number,
    product_ids: number[],
  ): Promise<{ message: string; updated: number }> {
    // Validate vendor exists
    const vendorExists = await this.productsRepository.manager
      .getRepository('Vendor')
      .findOne({ where: { id: vendorId, status: 'active' } });

    if (!vendorExists) {
      throw new NotFoundException('Vendor not found or is archived');
    }

    // Update all products
    const result = await this.productsRepository.update(
      { id: In(product_ids), status: ProductStatus.ACTIVE },
      { vendor_id: vendorId },
    );

    return {
      message: `${result.affected} products assigned to vendor "${vendorExists.name_en}"`,
      updated: result.affected || 0,
    };
  }

  /**
   * Remove vendor from multiple products
   */
  async removeProductsFromVendor(
    vendorId: number,
    product_ids: number[],
  ): Promise<{ message: string; updated: number }> {
    // Validate vendor exists
    const vendorExists = await this.productsRepository.manager
      .getRepository('Vendor')
      .findOne({ where: { id: vendorId } });

    if (!vendorExists) {
      throw new NotFoundException('Vendor not found');
    }

    // Remove vendor from products
    const result = await this.productsRepository.update(
      { id: In(product_ids), vendor_id: vendorId },
      { vendor_id: null as any },
    );

    return {
      message: `${result.affected} products removed from vendor "${vendorExists.name_en}"`,
      updated: result.affected || 0,
    };
  }
}
