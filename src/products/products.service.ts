import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { Media } from '../media/entities/media.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductPriceGroup } from './entities/product-price-group.entity';
import { ProductWeightGroup } from './entities/product-weight-group.entity';
import { ProductStock } from './entities/product-stock.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { IndexingService, IndexableProduct } from '../search/indexing.service';

import { ProductVariantCombination } from './entities/product-variant-combination.entity';
import { ProductPriceGroupValue } from './entities/product-price-group-value.entity';
import { ProductWeightGroupValue } from './entities/product-weight-group-value.entity';

import { Like, Not } from 'typeorm';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

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
    private readonly indexingService: IndexingService,
  ) {}

  // ─── Search indexing helpers ───────────────────────────────────────────────

  /**
   * Tokenize a string into lowercase words for tag generation.
   * Splits on whitespace, hyphens, slashes, commas, and dots.
   */
  private tokenizeForTags(text?: string | null): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .split(/[\s\-_/,\.\(\)\[\]]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 1);
  }

  /**
   * Build a deduplicated tag array from all searchable signal fields.
   * This is the key to making synonyms work: the synonym "mobile" → "smartphone"
   * only fires if "smartphone" actually appears somewhere in the document.
   * By adding the category name as a tag, the product becomes findable via synonyms
   * even if the product name itself doesn't contain those words.
   */
  private buildSearchTags(
    nameEn: string,
    nameAr: string,
    categoryNames: string[],
    brandEn?: string,
    brandAr?: string,
  ): string[] {
    const parts: string[] = [
      ...this.tokenizeForTags(nameEn),
      ...this.tokenizeForTags(nameAr),
      ...(brandEn ? this.tokenizeForTags(brandEn) : []),
      ...(brandAr ? this.tokenizeForTags(brandAr) : []),
      ...categoryNames.flatMap((n) => this.tokenizeForTags(n)),
    ];
    return [...new Set(parts)];
  }

  /**
   * Load the minimal product data needed for Typesense and upsert the document.
   * Fire-and-forget safe — errors are logged but never bubble up to the caller.
   */
  private async syncProductToIndex(productId: number, throwOnError = false): Promise<void> {
    try {
      const [product, productCategories, priceGroups, stockRows, mediaRows] =
        await Promise.all([
          this.productsRepository.findOne({
            where: { id: productId },
            relations: ['brand', 'category'],
          }),
          this.productCategoriesRepository.find({
            where: { product_id: productId },
            relations: ['category'],
          }),
          this.dataSource.getRepository(ProductPriceGroup).find({
            where: { product_id: productId },
          }),
          this.dataSource.getRepository(ProductStock).find({
            where: { product_id: productId },
          }),
          this.dataSource.getRepository(Media).find({
            where: { product_id: productId },
            order: { is_primary: 'DESC' },
          }),
        ]);

      if (!product) return;

      // ── Lowest price across all price groups (pick sale_price if set) ──────
      const sortedByPrice = [...priceGroups].sort(
        (a, b) =>
          (a.sale_price ?? a.price ?? 0) - (b.sale_price ?? b.price ?? 0),
      );
      const bestPrice = sortedByPrice[0];

      const totalStock = stockRows.reduce(
        (sum, s) => sum + (s.quantity ?? 0),
        0,
      );
      const images = mediaRows.map((m) => m.url).filter(Boolean);

      // ── Category resolution ───────────────────────────────────────────────
      // Use all categories from the junction table; fall back to primary relation
      const allCategories =
        productCategories
          .map((pc) => pc.category)
          .filter(Boolean) as Category[];

      const primaryCategory: Category | null =
        allCategories[0] ?? (product as any).category ?? null;

      // Subcategory = any category with level > 0 (level 0 = main, 1+ = sub)
      const subCategory =
        allCategories.find((c) => c.level > 0) ?? null;

      // ── Brand data ───────────────────────────────────────────────────────
      const brand = (product as any).brand as
        | { name_en: string; name_ar?: string }
        | null;

      // ── Descriptions — combine short + long for maximum text coverage ────
      const descriptionEn = [
        product.short_description_en,
        product.long_description_en,
      ]
        .filter(Boolean)
        .join(' ')
        .trim() || undefined;

      const descriptionAr = [
        product.short_description_ar,
        product.long_description_ar,
      ]
        .filter(Boolean)
        .join(' ')
        .trim() || undefined;

      // ── Auto-generated tags ──────────────────────────────────────────────
      // Synonyms only work when the synonym target word appears in an indexed field.
      // By tokenising category names into tags, searching "mobile" → synonym expands
      // to "smartphone" → matches a product in category "Smartphones".
      const categoryNamesForTags = allCategories.flatMap((c) =>
        [c.name_en, c.name_ar].filter(Boolean),
      );

      const tags = this.buildSearchTags(
        product.name_en,
        product.name_ar,
        categoryNamesForTags,
        brand?.name_en,
        brand?.name_ar,
      );

      const doc: IndexableProduct = {
        id: String(product.id),
        name_en: product.name_en,
        name_ar: product.name_ar,
        description_en: descriptionEn,
        description_ar: descriptionAr,
        brand: brand?.name_en ?? 'Unknown',
        category: primaryCategory?.name_en ?? 'Uncategorized',
        subcategory: subCategory?.name_en ?? undefined,
        tags: tags.length ? tags : undefined,
        price: bestPrice?.price ?? 0,
        sale_price: bestPrice?.sale_price ?? undefined,
        rating: Number(product.average_rating) || 0,
        rating_count: product.total_ratings ?? 0,
        stock_quantity: totalStock,
        is_available:
          product.status === ProductStatus.ACTIVE && product.visible,
        images: images.length ? images : undefined,
        created_at: product.created_at
          ? Math.floor(new Date(product.created_at).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
        seller_id: product.vendor_id ? String(product.vendor_id) : undefined,
        sales_count: undefined, // no sales_count column on entity currently
        popularity_score: this.indexingService.calculatePopularityScore(
          0,
          Number(product.average_rating) || 0,
          product.total_ratings ?? 0,
          product.created_at ?? new Date(),
        ),
      };

      await this.indexingService.upsertProduct(doc);
    } catch (err) {
      this.logger.warn(
        `Failed to sync product ${productId} to search index: ${err?.message}`,
      );
      if (throwOnError) throw err;
    }
  }

  /**
   * Bulk re-index all ACTIVE + visible products.
   * Called by the admin reindex endpoint.
   */
  async reindexAll(): Promise<{ indexed: number; failed: number; errors: string[] }> {
    const products = await this.productsRepository.find({
      where: { status: ProductStatus.ACTIVE, visible: true },
      relations: ['brand', 'category'],
    });

    const ids = products.map((p) => p.id);
    this.logger.log(`Reindexing ${ids.length} products…`);

    let indexed = 0;
    const errors: string[] = [];

    // Process concurrently in small batches to avoid DB overload
    const BATCH = 10;
    for (let i = 0; i < ids.length; i += BATCH) {
      const results = await Promise.allSettled(
        ids.slice(i, i + BATCH).map((id) => this.syncProductToIndex(id, true)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          indexed++;
        } else {
          errors.push(r.reason?.message ?? String(r.reason));
        }
      }
    }

    this.logger.log(`✅ Reindex complete — ${indexed}/${ids.length} products indexed, ${errors.length} failed`);
    if (errors.length) {
      this.logger.warn(`Reindex errors: ${errors.slice(0, 5).join(' | ')}`);
    }
    return { indexed, failed: errors.length, errors: errors.slice(0, 10) };
  }

  /** Runs every night at 03:00 to heal any drift between PostgreSQL and Typesense. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledReindex(): Promise<void> {
    this.logger.log('Scheduled nightly reindex started…');
    const { indexed, failed } = await this.reindexAll();
    this.logger.log(`Scheduled nightly reindex done — ${indexed} synced, ${failed} failed`);
  }

  // ──────────────────────────────────────────────────────────────────────────

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w\-]+/g, '') // Remove all non-word chars
      .replace(/\-\-+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text
  }

  private async generateUniqueSlug(
    name: string,
    currentId?: number,
  ): Promise<string> {
    const baseSlug = this.slugify(name);
    let finalSlug = baseSlug;
    let counter = 1;

    // Find all slugs that start with the baseSlug
    const existingProducts = await this.productsRepository.find({
      select: ['slug', 'id'],
      where: {
        slug: Like(`${baseSlug}%`),
      },
    });

    // Check availability
    const isAvailable = (slug: string) => {
      const match = existingProducts.find((p) => p.slug === slug);
      if (!match) return true; // No product has this slug
      if (currentId && match.id === currentId) return true; // It's the current product's slug
      return false; // Taken by someone else
    };

    while (!isAvailable(finalSlug)) {
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
    }

    return finalSlug;
  }

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

      const slug = await this.generateUniqueSlug(dto.name_en);

      // 1. Create basic product (primary category is first in the list)
      const product = this.productsRepository.create({
        name_en: dto.name_en,
        name_ar: dto.name_ar,
        slug: slug,
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

      // 4. Parallel Creation of Children
      const creationTasks: Promise<any>[] = [];
      const id = savedProduct.id;

      // Handle Media
      if (dto.media && dto.media.length > 0) {
        creationTasks.push(
          this.mediaGroupService.syncProductMedia(id, dto.media),
        );
      }

      // Handle Prices (Batch Insert)
      if (dto.prices && dto.prices.length > 0) {
        const simplePrices = dto.prices.filter(
          (p) => !p.combination || Object.keys(p.combination).length === 0,
        );
        const combinationPrices = dto.prices.filter(
          (p) => p.combination && Object.keys(p.combination).length > 0,
        );

        if (simplePrices.length > 0) {
          creationTasks.push(
            this.priceGroupService.createSimplePriceGroup(id, {
              cost: simplePrices[0].cost ?? 0,
              price: simplePrices[0].price,
              sale_price: simplePrices[0].sale_price,
            }),
          );
        }

        if (combinationPrices.length > 0) {
          const runBatchPrices = async () => {
            const priceRepo = this.dataSource.getRepository(ProductPriceGroup);
            const priceValueRepo = this.dataSource.getRepository(
              ProductPriceGroupValue,
            );

            const groupsToSave = combinationPrices.map((p) =>
              priceRepo.create({
                product_id: id,
                cost: p.cost,
                price: p.price,
                sale_price: p.sale_price,
              }),
            );

            const savedGroups = await priceRepo.save(groupsToSave);

            const valuesToSave: any[] = [];
            combinationPrices.forEach((p, index) => {
              const groupId = savedGroups[index].id;
              Object.entries(p.combination!).forEach(([attrId, valId]) => {
                valuesToSave.push(
                  priceValueRepo.create({
                    price_group_id: groupId,
                    attribute_id: Number(attrId),
                    attribute_value_id: valId,
                  }),
                );
              });
            });

            await priceValueRepo.save(valuesToSave);
          };
          creationTasks.push(runBatchPrices());
        }
      }

      // Handle Weights (Batch Insert)
      if (dto.weights && dto.weights.length > 0) {
        const simpleWeights = dto.weights.filter(
          (w) => !w.combination || Object.keys(w.combination).length === 0,
        );
        const combinationWeights = dto.weights.filter(
          (w) => w.combination && Object.keys(w.combination).length > 0,
        );

        if (simpleWeights.length > 0) {
          creationTasks.push(
            this.weightGroupService.createSimpleWeightGroup(id, {
              weight: simpleWeights[0].weight ?? 0,
              length: simpleWeights[0].length,
              width: simpleWeights[0].width,
              height: simpleWeights[0].height,
            }),
          );
        }

        if (combinationWeights.length > 0) {
          const runBatchWeights = async () => {
            const weightRepo =
              this.dataSource.getRepository(ProductWeightGroup);
            const weightValueRepo = this.dataSource.getRepository(
              ProductWeightGroupValue,
            );

            const groupsToSave = combinationWeights.map((w) =>
              weightRepo.create({
                product_id: id,
                weight: w.weight,
                length: w.length,
                width: w.width,
                height: w.height,
              }),
            );

            const savedGroups = await weightRepo.save(groupsToSave);

            const valuesToSave: any[] = [];
            combinationWeights.forEach((w, index) => {
              const groupId = savedGroups[index].id;
              Object.entries(w.combination!).forEach(([attrId, valId]) => {
                valuesToSave.push(
                  weightValueRepo.create({
                    weight_group_id: groupId,
                    attribute_id: Number(attrId),
                    attribute_value_id: valId,
                  }),
                );
              });
            });

            await weightValueRepo.save(valuesToSave);
          };
          creationTasks.push(runBatchWeights());
        }
      }

      // Handle Stocks and Variants (Batch Insert)
      if (dto.stocks && dto.stocks.length > 0) {
        const simpleStocks = dto.stocks.filter(
          (s) => !s.combination || Object.keys(s.combination).length === 0,
        );
        const combinationStocks = dto.stocks.filter(
          (s) => s.combination && Object.keys(s.combination).length > 0,
        );

        if (simpleStocks.length > 0) {
          creationTasks.push(
            this.variantsService.setSimpleStock(
              id,
              simpleStocks[0].quantity,
              simpleStocks[0].is_out_of_stock,
            ),
          );
        }

        if (combinationStocks.length > 0) {
          const runBatchStocks = async () => {
            // 1. Create Variants
            const variantRepo = this.dataSource.getRepository(ProductVariant);
            const variantComboRepo = this.dataSource.getRepository(
              ProductVariantCombination,
            );
            const stockRepo = this.dataSource.getRepository(ProductStock);
            const variantMap = new Map<string, number>();

            // Deduplicate combinations
            const uniqueCombinations = new Map<
              string,
              Record<string, number>
            >();
            combinationStocks.forEach((s) => {
              const key = Object.entries(s.combination!)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([k, v]) => `${k}:${v}`)
                .join('|');
              if (!uniqueCombinations.has(key)) {
                uniqueCombinations.set(key, s.combination!);
              }
            });

            const variantsToCreate = Array.from(uniqueCombinations.keys()).map(
              () => variantRepo.create({ product_id: id, is_active: true }),
            );

            const savedVariants = await variantRepo.save(variantsToCreate);

            const combosToSave: any[] = [];
            let i = 0;
            for (const [key, combination] of uniqueCombinations) {
              const variant = savedVariants[i];
              variantMap.set(key, variant.id);

              Object.values(combination).forEach((valId) => {
                combosToSave.push(
                  variantComboRepo.create({
                    variant_id: variant.id,
                    attribute_value_id: valId,
                  }),
                );
              });
              i++;
            }

            await variantComboRepo.save(combosToSave);

            // 2. Create Stocks
            const stocksToSave = combinationStocks.map((s) => {
              const key = Object.entries(s.combination!)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([k, v]) => `${k}:${v}`)
                .join('|');
              return stockRepo.create({
                product_id: id,
                variant_id: variantMap.get(key),
                quantity: s.quantity ?? 0,
                is_out_of_stock: s.is_out_of_stock ?? false,
              });
            });

            await stockRepo.save(stocksToSave);
          };
          creationTasks.push(runBatchStocks());
        }
      }

      await Promise.all(creationTasks);

      // Return the complete product
      const result = await this.findOne(savedProduct.id);

      // Sync to Typesense (fire-and-forget — never blocks the response)
      void this.syncProductToIndex(savedProduct.id);

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

  async findAll(filterDto: FilterProductDto, isAdmin = false) {
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
      ids: filterIds,
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

    // Filter by IDs
    if (filterIds && filterIds.length > 0) {
      baseQuery.andWhere('product.id IN (:...filterIds)', { filterIds });
    }

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

    const ids = idRows
      .map((r) => Number(r.id))
      .filter((id) => !Number.isNaN(id));

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
    // OPTIMIZATION: Fetch relations in parallel to avoid Cartesian product explosion
    const [
      data,
      productCategories,
      medias,
      stocks,
      variants,
      priceGroups,
      weightGroups,
      attributes,
    ] = await Promise.all([
      this.productsRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.brand', 'brand')
        .leftJoinAndSelect('product.vendor', 'vendor')
        .where('product.id IN (:...ids)', { ids })
        .orderBy(`product.${sortBy}`, sortOrder)
        .getMany(),
      this.productCategoriesRepository.find({
        where: { product_id: In(ids) },
        relations: ['category'],
      }),
      this.dataSource.getRepository(Media).find({
        where: { product_id: In(ids) },
        relations: ['mediaGroup', 'mediaGroup.groupValues'],
      }),
      this.dataSource.getRepository(ProductStock).find({
        where: { product_id: In(ids) },
      }),
      this.dataSource.getRepository(ProductVariant).find({
        where: { product_id: In(ids) },
        relations: [
          'combinations',
          'combinations.attribute_value',
          'combinations.attribute_value.attribute',
          'combinations.attribute_value.parent_value',
          'combinations.attribute_value.parent_value.attribute',
          'combinations.attribute_value.parent_value.parent_value',
          'combinations.attribute_value.parent_value.parent_value.attribute',
        ],
      }),
      this.dataSource.getRepository(ProductPriceGroup).find({
        where: { product_id: In(ids) },
        relations: ['groupValues'],
      }),
      this.dataSource.getRepository(ProductWeightGroup).find({
        where: { product_id: In(ids) },
        relations: ['groupValues'],
      }),
      this.dataSource.getRepository(ProductAttribute).find({
        where: { product_id: In(ids) },
        relations: ['attribute'],
      }),
    ]);

    // Attach relations to products
    data.forEach((product) => {
      (product as any).productCategories = productCategories.filter(
        (pc) => pc.product_id === product.id,
      );
      (product as any).media = medias.filter(
        (m) => m.product_id === product.id,
      );
      (product as any).stock = stocks.filter(
        (s) => s.product_id === product.id,
      );
      (product as any).variants = variants.filter(
        (v) => v.product_id === product.id,
      );
      (product as any).priceGroups = priceGroups.filter(
        (pg) => pg.product_id === product.id,
      );
      (product as any).weightGroups = weightGroups.filter(
        (wg) => wg.product_id === product.id,
      );
      (product as any).attributes = attributes.filter(
        (a) => a.product_id === product.id,
      );
    });

    // Transform each product using the detailed view structure
    const transformedData = data.map((product) =>
      this.transformProductDetail(product, isAdmin),
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
   * Transform product for detailed view (GET /products/:id)
   */
  private transformProductDetail(product: Product, isAdmin = false): any {
    const {
      media,
      priceGroups,
      weightGroups,
      stock,
      brand,
      variants,
      productCategories,
      attributes: productAttributes,
      ...rest
    } = product as any;

    const brandInfo = brand
      ? {
          id: brand.id,
          name_en: brand.name_en,
          name_ar: brand.name_ar,
          logo: brand.logo,
          status: brand.status,
        }
      : null;

    const categories =
      productCategories?.map((pc: any) => pc.category).filter(Boolean) || [];

    // --- Attributes Map ---
    const attributesMap: Record<string, any> = {};

    const addAttributeValue = (attr: any, val: any) => {
      if (!attr || !val) return;
      const attrId = String(attr.id);

      if (!attributesMap[attrId]) {
        attributesMap[attrId] = {
          name_en: attr.name_en,
          name_ar: attr.name_ar,
          unit_en: attr.unit_en,
          unit_ar: attr.unit_ar,
          values: {},
        };
      }

      const valId = String(val.id);
      if (!attributesMap[attrId].values[valId]) {
        attributesMap[attrId].values[valId] = {
          name_en: val.value_en || val.value,
          name_ar: val.value_ar,
          color_code: val.color_code,
        };
      }
    };

    const processAttributeRecursive = (val: any) => {
      if (!val) return;
      
      if (val.attribute) {
        addAttributeValue(val.attribute, val);
      }

      if (val.parent_value) {
        processAttributeRecursive(val.parent_value);
      }
    };

    variants?.forEach((v: any) => {
      v.combinations?.forEach((c: any) => {
        if (c.attribute_value) {
           processAttributeRecursive(c.attribute_value);
        }
      });
    });

    productAttributes?.forEach((pa: any) => {
      if (pa.attribute) {
        const attrId = String(pa.attribute.id);
        if (!attributesMap[attrId]) {
          attributesMap[attrId] = {
            name_en: pa.attribute.name_en,
            name_ar: pa.attribute.name_ar,
            values: {},
          };
        }
      }
    });

    // Groups Maps
    const priceGroupsMap: Record<string, any> = {};
    const weightGroupsMap: Record<string, any> = {};
    const mediaGroupsMap: Record<string, any> = {};

    priceGroups?.forEach((pg: any) => {
      priceGroupsMap[String(pg.id)] = {
        price: pg.price,
        sale_price: pg.sale_price,
        ...(isAdmin && { cost: pg.cost }),
      };
    });

    weightGroups?.forEach((wg: any) => {
      weightGroupsMap[String(wg.id)] = {
        weight: wg.weight,
        dimensions: {
          length: wg.length,
          width: wg.width,
          height: wg.height,
        },
      };
    });

    // Media Groups
    const groupedMedia = new Map<number, any[]>();
    media?.forEach((m: any) => {
      if (m.mediaGroup) {
        if (!groupedMedia.has(m.mediaGroup.id))
          groupedMedia.set(m.mediaGroup.id, []);
        groupedMedia.get(m.mediaGroup.id)!.push(m);
      }
    });

    groupedMedia.forEach((mediaList, groupId) => {
      const primaryProductImage = mediaList.find((m: any) => m.is_primary);
      const groupPrimaryImage = mediaList.find((m: any) => m.is_group_primary);

      // Fallback for sorting: prioritize product primary, then group primary, then first
      const mainDisplay =
        primaryProductImage || groupPrimaryImage || mediaList[0];

      const formatImage = (m: any) => ({
        id: m.id,
        url: m.url,
        type: m.type,
        alt_text: m.alt_text,
        is_primary: m.is_primary,
        is_group_primary: m.is_group_primary,
      });

      mediaGroupsMap[String(groupId)] = {
        media: mediaList
          .sort((a: any, b: any) => {
            if (a.id === mainDisplay.id) return -1;
            if (b.id === mainDisplay.id) return 1;
            return 0;
          })
          .map((m: any) => formatImage(m)),
      };
    });

    // Variants Mapping
    const variantsList =
      variants
        ?.map((v: any) => {
          const stockItem = stock?.find((s: any) => s.variant_id === v.id);
          const quantity = stockItem ? stockItem.quantity : 0;
          const is_out_of_stock = stockItem ? stockItem.is_out_of_stock : true;

          const attributeValues: Record<string, number> = {};
          const variantValueIds = new Set<number>();
          v.combinations?.forEach((c: any) => {
            attributeValues[String(c.attribute_value?.attribute_id)] =
              c.attribute_value_id;
            variantValueIds.add(c.attribute_value_id);
          });

          const getGroupId = (groups: any[]) => {
            const matches =
              groups?.filter((g: any) => {
                if (!g.groupValues || g.groupValues.length === 0) return true;
                return g.groupValues.every((gv: any) =>
                  variantValueIds.has(gv.attribute_value_id),
                );
              }) || [];
            matches.sort(
              (a: any, b: any) =>
                (b.groupValues?.length || 0) - (a.groupValues?.length || 0),
            );
            return matches.length > 0 ? String(matches[0].id) : null;
          };

          const distinctMediaGroups = new Map();
          media?.forEach((m: any) => {
            if (m.mediaGroup)
              distinctMediaGroups.set(m.mediaGroup.id, m.mediaGroup);
          });
          const mediaGroupsList = Array.from(distinctMediaGroups.values());

          return {
            id: v.id,
            is_active: v.is_active,
            ...(isAdmin && { quantity }),
            is_out_of_stock,
            attribute_values: attributeValues,
            price_group_id: getGroupId(priceGroups),
            media_group_id: getGroupId(mediaGroupsList),
            weight_group_id: getGroupId(weightGroups),
          };
        })
        .filter(Boolean) || [];

    const {
      category_id,
      vendor_id,
      brand_id,
      category,
      archived_at,
      archived_by,
      deleted_at,
      ...cleanRest
    } = rest;

    // Determine quantity for simple products
    let simpleProductQuantity: number | undefined = undefined;
    let simpleProductIsOutOfStock: boolean | undefined = undefined;
    if (variantsList.length === 0) {
      // If no variants, check for stock record associated directly with the product (where variant_id is null)
      const simpleStock = stock?.find((s: any) => !s.variant_id);
      if (simpleStock) {
        simpleProductQuantity = simpleStock.quantity;
        simpleProductIsOutOfStock = simpleStock.is_out_of_stock;
      } else {
        simpleProductQuantity = 0;
        simpleProductIsOutOfStock = true;
      }
    }

    return {
      ...cleanRest,
      brand: brandInfo,
      categories,
      attributes: attributesMap,
      media_groups: mediaGroupsMap,
      price_groups: priceGroupsMap,
      weight_groups: weightGroupsMap,
      variants: variantsList,
      ...(isAdmin && simpleProductQuantity !== undefined && { quantity: simpleProductQuantity }),
      ...(simpleProductIsOutOfStock !== undefined && { is_out_of_stock: simpleProductIsOutOfStock }),
    };
  }

  async findOne(id: number, isAdmin = false): Promise<any> {
    const [
      productBase,
      productCategories,
      media,
      priceGroups,
      weightGroups,
      stock,
      variants,
      attributes,
    ] = await Promise.all([
      this.productsRepository.findOne({
        where: { id },
        relations: ['category', 'vendor', 'brand'],
      }),
      this.dataSource.getRepository(ProductCategory).find({
        where: { product_id: id },
        relations: ['category'],
      }),
      this.dataSource.getRepository(Media).find({
        where: { product_id: id },
        relations: ['mediaGroup', 'mediaGroup.groupValues'],
      }),
      this.dataSource.getRepository(ProductPriceGroup).find({
        where: { product_id: id },
        relations: ['groupValues'],
      }),
      this.dataSource.getRepository(ProductWeightGroup).find({
        where: { product_id: id },
        relations: ['groupValues'],
      }),
      this.dataSource.getRepository(ProductStock).find({
        where: { product_id: id },
      }),
      this.dataSource.getRepository(ProductVariant).find({
        where: { product_id: id },
        relations: [
          'combinations',
          'combinations.attribute_value',
          'combinations.attribute_value.attribute',
          'combinations.attribute_value.parent_value',
          'combinations.attribute_value.parent_value.attribute',
          'combinations.attribute_value.parent_value.parent_value',
          'combinations.attribute_value.parent_value.parent_value.attribute',
        ],
      }),
      this.dataSource.getRepository(ProductAttribute).find({
        where: { product_id: id },
        relations: ['attribute'],
      }),
    ]);

    if (!productBase) {
      throw new NotFoundException('Product not found');
    }

    productBase.productCategories = productCategories;
    productBase.media = media;
    productBase.priceGroups = priceGroups;
    productBase.weightGroups = weightGroups;
    productBase.stock = stock;
    productBase.variants = variants;
    productBase.attributes = attributes;

    // Return detailed product structure
    return this.transformProductDetail(productBase, isAdmin);
  }

  async findOneBySlug(slug: string, isAdmin = false): Promise<any> {
    const product = await this.productsRepository.findOne({
      where: { slug },
      select: ['id'],
    });

    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    return this.findOne(product.id, isAdmin);
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
      variants,
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

    const variantsList =
      variants?.map((v: any) => ({
        id: v.id,
        combinations:
          v.combinations?.map((c: any) => ({
            attribute_id: c.attribute_value?.attribute_id,
            attribute_name: c.attribute_value?.attribute?.name_en || null,
            attribute_name_ar: c.attribute_value?.attribute?.name_ar || null,
            unit_en: c.attribute_value?.attribute?.unit_en || null,
            unit_ar: c.attribute_value?.attribute?.unit_ar || null,
            value_id: c.attribute_value_id,
            value_name: c.attribute_value?.value || null,
            value_name_ar: c.attribute_value?.value_ar || null,
            color_code: c.attribute_value?.color_code || null,
          })) || [],
      })) || [];

    return {
      ...rest,
      brand: brandInfo,
      categories,
      media: transformedMedia,
      prices: priceGroups || [],
      weights: weightGroups || [],
      variants: variantsList,
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

      // Auto-update slug if name changes
      if (dto.name_en) {
        basicInfoChanges.slug = await this.generateUniqueSlug(dto.name_en, id);
      }

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
      // =================================================================
      // PHASE 1: CLEANUP & SYNC (Parallelized)
      // =================================================================
      const cleanupTasks: Promise<any>[] = [];

      // 1. Sync Media
      if (dto.media !== undefined) {
        cleanupTasks.push(
          this.mediaGroupService.syncProductMedia(id, dto.media || []),
        );
      }

      // 2. Delete Prices, Weights, Stocks (Independent groups)
      cleanupTasks.push(this.priceGroupService.deletePriceGroupsForProduct(id));
      cleanupTasks.push(
        this.weightGroupService.deleteWeightGroupsForProduct(id),
      );
      cleanupTasks.push(this.variantsService.deleteAllStocksForProduct(id));

      // 3. Variant Cleanup Chain (Cart -> Variants -> Attributes)
      // NOTE: Deleting variants is extremely slow. We should only delete if absolutely necessary.
      // But currently the logic requires full rebuild.
      const variantCleanupTask = async () => {
        // Delete related cart items to avoid Foreign Key constraint violations
        await this.dataSource
          .getRepository(CartItem)
          .delete({ product_id: id });

        // Delete all existing variants
        await this.variantsService.deleteAllVariantsForProduct(id);

        // Delete all existing attributes
        await this.variantsService.deleteAllAttributesForProduct(id);
      };
      cleanupTasks.push(variantCleanupTask());

      // Execute all cleanup tasks in parallel
      await Promise.all(cleanupTasks);

      // =================================================================
      // PHASE 2: REBUILD STRUCTURE (Attributes)
      // =================================================================
      // Attributes define the structure for variants/combinations, so they must be created first
      if (dto.attributes && dto.attributes.length > 0) {
        await this.variantsService.addProductAttributes(id, dto.attributes);
      }

      // =================================================================
      // PHASE 3: REBUILD DATA (Optimized Batch Creation)
      // =================================================================

      // 1. Create Variants for Stocks (Needed for mapping)
      // We only strictly need variants for stocks. Prices/Weights use their own groups.
      const variantMap = new Map<string, number>(); // combinationKey -> variantId

      if (dto.stocks && dto.stocks.length > 0) {
        const combinationStocks = dto.stocks.filter(
          (s) => s.combination && Object.keys(s.combination).length > 0,
        );

        if (combinationStocks.length > 0) {
          // Identify unique combinations from stocks
          const uniqueCombinations = new Map<string, Record<string, number>>();
          combinationStocks.forEach((s) => {
            // Create a consistent key for the combination
            const key = Object.entries(s.combination!)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([k, v]) => `${k}:${v}`)
              .join('|');

            if (!uniqueCombinations.has(key)) {
              uniqueCombinations.set(key, s.combination!);
            }
          });

          // Create variants in bulk
          if (uniqueCombinations.size > 0) {
            const variantRepo = this.dataSource.getRepository(ProductVariant);
            const variantComboRepo = this.dataSource.getRepository(
              ProductVariantCombination,
            );

            const variantsToCreate = Array.from(uniqueCombinations.keys()).map(
              () => variantRepo.create({ product_id: id, is_active: true }),
            );

            const savedVariants = await variantRepo.save(variantsToCreate);

            // Prepare combinations data
            const combosToSave: any[] = [];
            let i = 0;
            for (const [key, combination] of uniqueCombinations) {
              const variant = savedVariants[i];
              variantMap.set(key, variant.id);

              const attributeValues = Object.values(combination);
              attributeValues.forEach((valId) => {
                combosToSave.push(
                  variantComboRepo.create({
                    variant_id: variant.id,
                    attribute_value_id: valId,
                  }),
                );
              });
              i++;
            }

            await variantComboRepo.save(combosToSave);
          }
        }
      }

      const creationTasks: Promise<any>[] = [];

      // 2. Rebuild Prices (Direct Insert - Skip Check)
      if (dto.prices && dto.prices.length > 0) {
        const simplePrices = dto.prices.filter(
          (p) => !p.combination || Object.keys(p.combination).length === 0,
        );
        const combinationPrices = dto.prices.filter(
          (p) => p.combination && Object.keys(p.combination).length > 0,
        );

        // Simple Prices
        if (simplePrices.length > 0) {
          creationTasks.push(
            this.priceGroupService.createSimplePriceGroup(id, {
              cost: simplePrices[0].cost ?? 0, // Take first valid simple price
              price: simplePrices[0].price,
              sale_price: simplePrices[0].sale_price,
            }),
          );
        }

        // Combination Prices - Use Direct Insert for speed
        if (combinationPrices.length > 0) {
          const runBatchPrices = async () => {
            const priceRepo = this.dataSource.getRepository(ProductPriceGroup);
            const priceValueRepo = this.dataSource.getRepository(
              ProductPriceGroupValue,
            );

            const groupsToSave = combinationPrices.map((p) =>
              priceRepo.create({
                product_id: id,
                cost: p.cost,
                price: p.price,
                sale_price: p.sale_price,
              }),
            );

            const savedGroups = await priceRepo.save(groupsToSave);

            const valuesToSave: any[] = [];
            combinationPrices.forEach((p, index) => {
              const groupId = savedGroups[index].id;
              Object.entries(p.combination!).forEach(([attrId, valId]) => {
                valuesToSave.push(
                  priceValueRepo.create({
                    price_group_id: groupId,
                    attribute_id: Number(attrId),
                    attribute_value_id: valId,
                  }),
                );
              });
            });

            await priceValueRepo.save(valuesToSave);
          };
          creationTasks.push(runBatchPrices());
        }
      }

      // 3. Rebuild Weights (Direct Insert - Skip Check)
      if (dto.weights && dto.weights.length > 0) {
        const simpleWeights = dto.weights.filter(
          (w) => !w.combination || Object.keys(w.combination).length === 0,
        );
        const combinationWeights = dto.weights.filter(
          (w) => w.combination && Object.keys(w.combination).length > 0,
        );

        if (simpleWeights.length > 0) {
          creationTasks.push(
            this.weightGroupService.createSimpleWeightGroup(id, {
              weight: simpleWeights[0].weight ?? 0,
              length: simpleWeights[0].length,
              width: simpleWeights[0].width,
              height: simpleWeights[0].height,
            }),
          );
        }

        if (combinationWeights.length > 0) {
          const runBatchWeights = async () => {
            const weightRepo =
              this.dataSource.getRepository(ProductWeightGroup);
            const weightValueRepo = this.dataSource.getRepository(
              ProductWeightGroupValue,
            );

            const groupsToSave = combinationWeights.map((w) =>
              weightRepo.create({
                product_id: id,
                weight: w.weight,
                length: w.length,
                width: w.width,
                height: w.height,
              }),
            );

            const savedGroups = await weightRepo.save(groupsToSave);

            const valuesToSave: any[] = [];
            combinationWeights.forEach((w, index) => {
              const groupId = savedGroups[index].id;
              Object.entries(w.combination!).forEach(([attrId, valId]) => {
                valuesToSave.push(
                  weightValueRepo.create({
                    weight_group_id: groupId,
                    attribute_id: Number(attrId),
                    attribute_value_id: valId,
                  }),
                );
              });
            });

            await weightValueRepo.save(valuesToSave);
          };
          creationTasks.push(runBatchWeights());
        }
      }

      // 4. Rebuild Stocks (Use Pre-created Variants)
      if (dto.stocks && dto.stocks.length > 0) {
        const simpleStocks = dto.stocks.filter(
          (s) => !s.combination || Object.keys(s.combination).length === 0,
        );
        const combinationStocks = dto.stocks.filter(
          (s) => s.combination && Object.keys(s.combination).length > 0,
        );

        if (simpleStocks.length > 0) {
          creationTasks.push(
            this.variantsService.setSimpleStock(
              id,
              simpleStocks[0].quantity,
              simpleStocks[0].is_out_of_stock,
            ),
          );
        }

        if (combinationStocks.length > 0) {
          const runBatchStocks = async () => {
            const stockRepo = this.dataSource.getRepository(ProductStock);
            const stocksToSave: any[] = [];

            for (const s of combinationStocks) {
              const key = Object.entries(s.combination!)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([k, v]) => `${k}:${v}`)
                .join('|');

              const variantId = variantMap.get(key);
              if (variantId) {
                stocksToSave.push(
                  stockRepo.create({
                    product_id: id,
                    variant_id: variantId,
                    quantity: s.quantity ?? 0,
                    is_out_of_stock: s.is_out_of_stock ?? false,
                  }),
                );
              } else {
                // Fallback (Should not happen if logic is correct): Create variant on fly
                await this.variantsService.setStockByCombination(
                  id,
                  s.combination!,
                  s.quantity ?? 0,
                );
              }
            }

            if (stocksToSave.length > 0) {
              await stockRepo.save(stocksToSave);
            }
          };
          creationTasks.push(runBatchStocks());
        }
      }

      // Execute all creation tasks in parallel
      await Promise.all(creationTasks);

      // Return updated product
      const updatedProduct = await this.findOne(id);

      // Sync to Typesense (fire-and-forget)
      void this.syncProductToIndex(id);

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

    // Remove from search index (fire-and-forget)
    void this.indexingService
      .deleteProduct(String(id))
      .catch((err) =>
        this.logger.warn(`Failed to remove product ${id} from index: ${err?.message}`),
      );

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
