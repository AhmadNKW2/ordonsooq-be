import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category, CategoryStatus } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';
import {
  RestoreCategoryDto,
  PermanentDeleteCategoryDto,
  RestoreSubcategoryOptions,
  RestoreProductsOptions,
} from './dto/archive-category.dto';
import { Product, ProductStatus } from '../products/entities/product.entity';
import { ProductCategory } from '../products/entities/product-category.entity';
import { VendorStatus } from '../vendors/entities/vendor.entity';
import { R2StorageService } from '../common/services/r2-storage.service';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(ProductCategory)
    private productCategoriesRepository: Repository<ProductCategory>,
    private r2StorageService: R2StorageService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    let level = 0;

    // If has parent, calculate level
    if (createCategoryDto.parent_id) {
      const parent = await this.categoriesRepository.findOne({
        where: { id: createCategoryDto.parent_id },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }

      // Check max nesting level (max 2 = sub-sub-category)
      if (parent.level >= 2) {
        throw new BadRequestException(
          'Maximum nesting level reached (3 levels)',
        );
      }

      level = parent.level + 1;
    }

    // Get max sortOrder and add 1
    const maxSortOrder = await this.categoriesRepository
      .createQueryBuilder('category')
      .select('MAX(category.sortOrder)', 'max')
      .getRawOne();

    const nextSortOrder = (maxSortOrder?.max ?? -1) + 1;

    // Map parent_id from DTO to parent_id for entity
    const { parent_id, product_ids, ...rest } = createCategoryDto;
    const category = this.categoriesRepository.create({
      ...rest,
      parent_id: parent_id,
      level,
      sortOrder: nextSortOrder,
    });

    const savedCategory = await this.categoriesRepository.save(category);

    // Assign products if provided
    if (product_ids && product_ids.length > 0) {
      await this.syncProductsToCategory(savedCategory.id, product_ids);
    }

    return savedCategory;
  }

  /**
   * Sync products to a category - replaces all existing assignments
   */
  private async syncProductsToCategory(
    categoryId: number,
    product_ids: number[],
  ): Promise<void> {
    // Delete existing assignments for this category
    await this.productCategoriesRepository.delete({ category_id: categoryId });

    if (product_ids.length === 0) return;

    // Validate products exist and are active
    const products = await this.productsRepository.find({
      where: { id: In(product_ids), status: ProductStatus.ACTIVE },
    });

    if (products.length > 0) {
      const newAssignments = products.map((product) =>
        this.productCategoriesRepository.create({
          product_id: product.id,
          category_id: categoryId,
        }),
      );
      await this.productCategoriesRepository.save(newAssignments);
    }
  }

  async findAll(filterDto?: FilterCategoryDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'sortOrder',
      sortOrder = 'ASC',
      visible,
      status,
      parent_id,
      level,
      search,
    } = filterDto || {};

    const queryBuilder = this.categoriesRepository
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .where('category.status = :activeStatus', {
        activeStatus: CategoryStatus.ACTIVE,
      }); // Only active categories

    // Filter by visible
    if (visible !== undefined) {
      queryBuilder.andWhere('category.visible = :visible', { visible });
    }

    // Filter by status (override default ACTIVE if specified)
    if (status !== undefined) {
      queryBuilder.andWhere('category.status = :status', { status });
    }

    // Filter by parent_id
    if (parent_id !== undefined) {
      if (parent_id === null) {
        queryBuilder.andWhere('category.parent_id IS NULL');
      } else {
        queryBuilder.andWhere('category.parent_id = :parent_id', { parent_id });
      }
    } else if (!search) {
      // Default to root categories only if no specific parent requested AND no search term
      // If searching, we want to find matches anywhere in the tree
      queryBuilder.andWhere('category.parent_id IS NULL');
    }

    // Filter by level
    if (level !== undefined) {
      queryBuilder.andWhere('category.level = :level', { level });
    }

    // Search
    if (search) {
      queryBuilder.andWhere(
        '(category.name_en ILIKE :search OR category.name_ar ILIKE :search OR category.description_en ILIKE :search OR category.description_ar ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Sorting
    queryBuilder.orderBy(`category.${sortBy}`, sortOrder);

    // Pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

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

  // Get full category tree - Active only
  async getCategoryTree(): Promise<Category[]> {
    const mainCategories = await this.categoriesRepository
      .createQueryBuilder('category')
      .leftJoinAndSelect(
        'category.children',
        'children',
        'children.status = :status',
        { status: CategoryStatus.ACTIVE },
      )
      .leftJoinAndSelect(
        'children.children',
        'grandchildren',
        'grandchildren.status = :status',
        { status: CategoryStatus.ACTIVE },
      )
      .where('category.level = :level', { level: 0 })
      .andWhere('category.status = :status', { status: CategoryStatus.ACTIVE })
      .orderBy('category.sortOrder', 'ASC')
      .getMany();

    return mainCategories;
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: [
        'parent',
        'children',
        'productCategories',
        'productCategories.product',
      ],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Transform productCategories to products array for backward compatibility
    if (category.productCategories) {
      (category as any).products = category.productCategories
        .map((pc) => pc.product)
        .filter(Boolean);
      // Remove productCategories from response
      delete (category as any).productCategories;
    }

    return category;
  }

  async update(
    id: number,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOne(id);
    const oldImageUrl = category.image;

    const { product_ids, ...updateData } = updateCategoryDto;

    Object.assign(category, updateData);
    await this.categoriesRepository.save(category);

    // Delete old image from R2 if a new one was uploaded
    if (updateData.image && oldImageUrl && updateData.image !== oldImageUrl) {
      try {
        await this.r2StorageService.deleteFile(oldImageUrl);
      } catch (error) {
        this.logger.warn(
          `Failed to delete old category image: ${oldImageUrl}`,
          error,
        );
      }
    }

    // Sync products if provided
    if (product_ids !== undefined) {
      await this.syncProductsToCategory(id, product_ids);
    }

    // Re-fetch to get updated relations
    return this.findOne(id);
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  /**
   * Get all descendant category IDs (children, grandchildren, etc.)
   */
  private async getAllDescendantIds(categoryId: number): Promise<number[]> {
    const descendants: number[] = [];

    const findDescendants = async (parent_id: number) => {
      const children = await this.categoriesRepository.find({
        where: { parent_id },
        select: ['id'],
      });

      for (const child of children) {
        descendants.push(child.id);
        await findDescendants(child.id);
      }
    };

    await findDescendants(categoryId);
    return descendants;
  }

  /**
   * Archive a category and all its descendants + products (Soft Delete)
   */
  async archive(
    id: number,
    userId: number,
  ): Promise<{
    archivedCategories: number;
    archivedProducts: number;
  }> {
    const category = await this.findOne(id);

    if (category.status === CategoryStatus.ARCHIVED) {
      throw new BadRequestException('Category is already archived');
    }

    // Get all descendant category IDs
    const descendantIds = await this.getAllDescendantIds(id);
    const allCategoryIds = [id, ...descendantIds];

    // Archive all categories (preserve visible flag)
    const now = new Date();
    await this.categoriesRepository.update(
      { id: In(allCategoryIds) },
      {
        status: CategoryStatus.ARCHIVED,
        archived_at: now,
        archived_by: userId,
      },
    );

    // Get all product IDs in these categories via junction table
    const productCategories = await this.productCategoriesRepository.find({
      where: { category_id: In(allCategoryIds) },
      select: ['product_id'],
    });
    const product_ids = [
      ...new Set(productCategories.map((pc) => pc.product_id)),
    ];

    let archivedProducts = 0;
    if (product_ids.length > 0) {
      // Archive all products in these categories (preserve visible flag)
      const productsResult = await this.productsRepository.update(
        { id: In(product_ids), status: ProductStatus.ACTIVE },
        {
          status: ProductStatus.ARCHIVED,
          archived_at: now,
          archived_by: userId,
        },
      );
      archivedProducts = productsResult.affected || 0;
    }

    return {
      archivedCategories: allCategoryIds.length,
      archivedProducts,
    };
  }

  /**
   * Restore a category from archive with granular options
   */
  async restore(
    id: number,
    restoreDto: RestoreCategoryDto,
  ): Promise<{
    restoredCategories: number;
    restoredProducts: number;
    skippedProducts: number;
    skippedCategories: number;
    details: {
      categoryId: number;
      categoryName: string;
      productsRestored: number;
      productsSkipped: number;
      subcategoriesRestored: number;
    }[];
  }> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: ['parent', 'children'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.status === CategoryStatus.ACTIVE) {
      throw new BadRequestException('Category is not archived');
    }

    // Check if parent is archived
    if (
      category.parent_id &&
      !restoreDto.new_parent_id &&
      !restoreDto.makeRoot
    ) {
      const parent = await this.categoriesRepository.findOne({
        where: { id: category.parent_id },
      });

      if (parent && parent.status === CategoryStatus.ARCHIVED) {
        throw new BadRequestException(
          'Parent category is archived. Please either: ' +
            '1) Restore the parent category first, ' +
            '2) Provide new_parent_id to move to an active parent, or ' +
            '3) Set makeRoot=true to make this a root category.',
        );
      }
    }

    let totalRestoredCategories = 0;
    let totalRestoredProducts = 0;
    let totalSkippedProducts = 0;
    let totalSkippedCategories = 0;
    const details: any[] = [];

    // Handle parent reassignment
    if (restoreDto.makeRoot) {
      category.parent_id = null;
      category.level = 0;
    } else if (restoreDto.new_parent_id) {
      const newParent = await this.categoriesRepository.findOne({
        where: { id: restoreDto.new_parent_id },
      });

      if (!newParent) {
        throw new NotFoundException('New parent category not found');
      }

      if (newParent.status === CategoryStatus.ARCHIVED) {
        throw new BadRequestException('Cannot move to an archived category');
      }

      if (newParent.level >= 2) {
        throw new BadRequestException(
          'Maximum nesting level reached (3 levels)',
        );
      }

      category.parent_id = restoreDto.new_parent_id;
      category.level = newParent.level + 1;
    }

    // Restore this category
    category.status = CategoryStatus.ACTIVE;
    category.archived_at = null;
    category.archived_by = null;
    await this.categoriesRepository.save(category);
    totalRestoredCategories = 1;

    // Restore products for this category based on options
    const categoryProductResult = await this.restoreProductsForCategory(
      id,
      restoreDto.products,
    );
    totalRestoredProducts += categoryProductResult.restored;
    totalSkippedProducts += categoryProductResult.skipped;

    details.push({
      categoryId: id,
      categoryName: category.name_en,
      productsRestored: categoryProductResult.restored,
      productsSkipped: categoryProductResult.skipped,
      subcategoriesRestored: 0,
    });

    // Handle legacy restoreAllContents option
    if (restoreDto.restoreAllContents) {
      restoreDto.restoreAllSubcategories = true;
      if (!restoreDto.products) {
        restoreDto.products = { restoreAll: true };
      }
    }

    // Handle subcategory restoration
    if (restoreDto.restoreAllSubcategories) {
      // Restore ALL descendant categories with ALL products
      const descendantResult = await this.restoreAllDescendants(
        id,
        category.level,
      );
      totalRestoredCategories += descendantResult.restoredCategories;
      totalRestoredProducts += descendantResult.restoredProducts;
      totalSkippedProducts += descendantResult.skippedProducts;
      details[0].subcategoriesRestored = descendantResult.restoredCategories;
    } else if (
      restoreDto.subcategories &&
      restoreDto.subcategories.length > 0
    ) {
      // Restore specific subcategories with their options
      for (const subcatOptions of restoreDto.subcategories) {
        const subcatResult = await this.restoreSubcategory(
          subcatOptions,
          category.level + 1,
        );
        totalRestoredCategories += subcatResult.restoredCategories;
        totalRestoredProducts += subcatResult.restoredProducts;
        totalSkippedProducts += subcatResult.skippedProducts;
        totalSkippedCategories += subcatResult.skippedCategories;
        details.push(...subcatResult.details);
      }
      details[0].subcategoriesRestored = restoreDto.subcategories.length;
    }

    return {
      restoredCategories: totalRestoredCategories,
      restoredProducts: totalRestoredProducts,
      skippedProducts: totalSkippedProducts,
      skippedCategories: totalSkippedCategories,
      details,
    };
  }

  /**
   * Restore products for a specific category based on options
   */
  private async restoreProductsForCategory(
    categoryId: number,
    options?: RestoreProductsOptions,
  ): Promise<{ restored: number; skipped: number }> {
    if (
      !options ||
      (!options.restoreAll &&
        (!options.product_ids || options.product_ids.length === 0))
    ) {
      return { restored: 0, skipped: 0 };
    }

    // Get product IDs in this category via junction table
    const productCategories = await this.productCategoriesRepository.find({
      where: { category_id: categoryId },
      select: ['product_id'],
    });
    let product_ids = productCategories.map((pc) => pc.product_id);

    // Filter by specific product IDs if provided
    if (options.product_ids && options.product_ids.length > 0) {
      product_ids = product_ids.filter((id) =>
        options.product_ids!.includes(id),
      );
    }

    if (product_ids.length === 0) {
      return { restored: 0, skipped: 0 };
    }

    // Get archived products with their vendor info
    const products = await this.productsRepository.find({
      where: { id: In(product_ids), status: ProductStatus.ARCHIVED },
      relations: ['vendor'],
    });

    let restored = 0;
    let skipped = 0;

    for (const product of products) {
      // Check if vendor is active (if product has a vendor)
      if (product.vendor && product.vendor.status === VendorStatus.ARCHIVED) {
        skipped++;
        continue;
      }

      // Restore the product
      product.status = ProductStatus.ACTIVE;
      product.archived_at = null;
      product.archived_by = null;
      await this.productsRepository.save(product);
      restored++;
    }

    return { restored, skipped };
  }

  /**
   * Restore a specific subcategory with its options (recursive)
   */
  private async restoreSubcategory(
    options: RestoreSubcategoryOptions,
    expectedLevel: number,
  ): Promise<{
    restoredCategories: number;
    restoredProducts: number;
    skippedProducts: number;
    skippedCategories: number;
    details: any[];
  }> {
    const category = await this.categoriesRepository.findOne({
      where: { id: options.id },
      relations: ['children'],
    });

    if (!category) {
      return {
        restoredCategories: 0,
        restoredProducts: 0,
        skippedProducts: 0,
        skippedCategories: 1,
        details: [
          {
            categoryId: options.id,
            categoryName: 'Not Found',
            productsRestored: 0,
            productsSkipped: 0,
            subcategoriesRestored: 0,
            error: 'Category not found',
          },
        ],
      };
    }

    if (category.status === CategoryStatus.ACTIVE) {
      return {
        restoredCategories: 0,
        restoredProducts: 0,
        skippedProducts: 0,
        skippedCategories: 0,
        details: [
          {
            categoryId: options.id,
            categoryName: category.name_en,
            productsRestored: 0,
            productsSkipped: 0,
            subcategoriesRestored: 0,
            note: 'Already active',
          },
        ],
      };
    }

    let totalRestoredCategories = 0;
    let totalRestoredProducts = 0;
    let totalSkippedProducts = 0;
    let totalSkippedCategories = 0;
    const details: any[] = [];

    // Restore this subcategory
    category.status = CategoryStatus.ACTIVE;
    category.level = expectedLevel;
    category.archived_at = null;
    category.archived_by = null;
    await this.categoriesRepository.save(category);
    totalRestoredCategories = 1;

    // Restore products for this subcategory
    const productResult = await this.restoreProductsForCategory(
      options.id,
      options.products,
    );
    totalRestoredProducts += productResult.restored;
    totalSkippedProducts += productResult.skipped;

    const categoryDetail = {
      categoryId: options.id,
      categoryName: category.name_en,
      productsRestored: productResult.restored,
      productsSkipped: productResult.skipped,
      subcategoriesRestored: 0,
    };

    // Handle nested subcategories
    if (options.restoreAllSubcategories) {
      const descendantResult = await this.restoreAllDescendants(
        options.id,
        expectedLevel,
      );
      totalRestoredCategories += descendantResult.restoredCategories;
      totalRestoredProducts += descendantResult.restoredProducts;
      totalSkippedProducts += descendantResult.skippedProducts;
      categoryDetail.subcategoriesRestored =
        descendantResult.restoredCategories;
    } else if (options.subcategories && options.subcategories.length > 0) {
      for (const nestedOptions of options.subcategories) {
        const nestedResult = await this.restoreSubcategory(
          nestedOptions,
          expectedLevel + 1,
        );
        totalRestoredCategories += nestedResult.restoredCategories;
        totalRestoredProducts += nestedResult.restoredProducts;
        totalSkippedProducts += nestedResult.skippedProducts;
        totalSkippedCategories += nestedResult.skippedCategories;
        details.push(...nestedResult.details);
      }
      categoryDetail.subcategoriesRestored = options.subcategories.length;
    }

    details.unshift(categoryDetail);

    return {
      restoredCategories: totalRestoredCategories,
      restoredProducts: totalRestoredProducts,
      skippedProducts: totalSkippedProducts,
      skippedCategories: totalSkippedCategories,
      details,
    };
  }

  /**
   * Restore all descendants of a category (recursive)
   */
  private async restoreAllDescendants(
    parent_id: number,
    parentLevel: number,
  ): Promise<{
    restoredCategories: number;
    restoredProducts: number;
    skippedProducts: number;
  }> {
    // Get all archived children of this category
    const children = await this.categoriesRepository.find({
      where: { parent_id, status: CategoryStatus.ARCHIVED },
    });

    let restoredCategories = 0;
    let restoredProducts = 0;
    let skippedProducts = 0;

    for (const child of children) {
      // Restore this child
      child.status = CategoryStatus.ACTIVE;
      child.level = parentLevel + 1;
      child.archived_at = null;
      child.archived_by = null;
      await this.categoriesRepository.save(child);
      restoredCategories++;

      // Restore all products in this child
      const productResult = await this.restoreProductsForCategory(child.id, {
        restoreAll: true,
      });
      restoredProducts += productResult.restored;
      skippedProducts += productResult.skipped;

      // Recursively restore grandchildren
      const descendantResult = await this.restoreAllDescendants(
        child.id,
        parentLevel + 1,
      );
      restoredCategories += descendantResult.restoredCategories;
      restoredProducts += descendantResult.restoredProducts;
      skippedProducts += descendantResult.skippedProducts;
    }

    return { restoredCategories, restoredProducts, skippedProducts };
  }

  /**
   * Get all archived categories (Trash/Archive view)
   * Includes archived products and subcategories for each category
   */
  async findArchived(filterDto?: FilterCategoryDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'archived_at',
      sortOrder = 'DESC',
      search,
    } = filterDto || {};

    const queryBuilder = this.categoriesRepository
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .where('category.status = :status', { status: CategoryStatus.ARCHIVED });

    if (search) {
      queryBuilder.andWhere(
        '(category.name_en ILIKE :search OR category.name_ar ILIKE :search OR category.description_en ILIKE :search OR category.description_ar ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder.orderBy(`category.${sortBy}`, sortOrder);
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    // Add archived products, archived subcategories, and state info for each category
    const dataWithRelations = await Promise.all(
      data.map(async (cat) => {
        // Get archived products in this category with media
        const archivedProductsRaw = await this.productsRepository.find({
          where: { category_id: cat.id, status: ProductStatus.ARCHIVED },
          select: [
            'id',
            'name_en',
            'name_ar',
            'sku',
            'archived_at',
            'archived_by',
          ],
          relations: ['media'],
        });

        // Map products to include image from primary media or first media
        const archivedProducts = archivedProductsRaw.map((product) => {
          const primaryMedia = product.media?.find((m) => m.is_primary);
          const firstMedia = product.media?.[0];
          const image = primaryMedia?.url || firstMedia?.url || null;
          const { media, ...productData } = product;
          return { ...productData, image };
        });

        // Get archived subcategories
        const archivedSubcategories = await this.categoriesRepository.find({
          where: { parent_id: cat.id, status: CategoryStatus.ARCHIVED },
          select: [
            'id',
            'name_en',
            'name_ar',
            'image',
            'archived_at',
            'archived_by',
          ],
        });

        return {
          ...cat,
          wasLive: cat.visible === true,
          wasDraft: cat.visible === false,
          archivedProducts,
          archivedSubcategories,
        };
      }),
    );

    return {
      data: dataWithRelations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Permanently delete a category (Hard Delete)
   * Category must be archived first.
   * Products inside must be handled: either delete them permanently or move to another category.
   */
  async permanentDelete(
    id: number,
    options?: PermanentDeleteCategoryDto,
  ): Promise<{ message: string }> {
    const category = await this.categoriesRepository.findOne({
      where: { id, status: CategoryStatus.ARCHIVED },
      relations: ['children'],
    });

    if (!category) {
      throw new NotFoundException(
        'Category not found or not archived. Only archived categories can be permanently deleted.',
      );
    }

    // Check for children - must delete children first
    if (category.children && category.children.length > 0) {
      throw new BadRequestException(
        'Cannot permanently delete category with subcategories. Delete or move subcategories first.',
      );
    }

    // Count products in this category (only archived ones can be deleted)
    const archivedProductCount = await this.productsRepository.count({
      where: { category_id: id, status: ProductStatus.ARCHIVED },
    });

    const activeProductCount = await this.productsRepository.count({
      where: { category_id: id, status: ProductStatus.ACTIVE },
    });

    // Active products cannot be permanently deleted - must be archived first
    if (activeProductCount > 0) {
      throw new BadRequestException(
        `Category has ${activeProductCount} active products. Archive them first before permanent deletion.`,
      );
    }

    if (archivedProductCount > 0) {
      if (!options?.deleteProducts && !options?.move_products_to_category_id) {
        throw new BadRequestException(
          `Category has ${archivedProductCount} archived products. Choose one option:\n` +
            '1. Set deleteProducts=true to permanently delete all products\n' +
            '2. Set move_products_to_category_id=<id> to move products to another category',
        );
      }

      if (options.deleteProducts && options.move_products_to_category_id) {
        throw new BadRequestException(
          'Cannot use both deleteProducts and move_products_to_category_id. Choose one option.',
        );
      }

      if (options.move_products_to_category_id) {
        // Validate target category exists and is active
        const targetCategory = await this.categoriesRepository.findOne({
          where: {
            id: options.move_products_to_category_id,
            status: CategoryStatus.ACTIVE,
          },
        });

        if (!targetCategory) {
          throw new BadRequestException(
            'Target category not found or is archived',
          );
        }

        // Move products to target category (keep them archived)
        await this.productsRepository.update(
          { category_id: id },
          { category_id: options.move_products_to_category_id },
        );
      } else if (options.deleteProducts) {
        // Permanently delete all archived products
        await this.productsRepository.delete({
          category_id: id,
          status: ProductStatus.ARCHIVED,
        });
      }
    }

    const imageUrl = category.image;

    // Perform hard delete of category
    await this.categoriesRepository.delete(id);

    // Delete image from R2
    if (imageUrl) {
      try {
        await this.r2StorageService.deleteFile(imageUrl);
      } catch (error) {
        this.logger.warn(`Failed to delete category image: ${imageUrl}`, error);
      }
    }

    return { message: `Category "${category.name_en}" permanently deleted` };
  }

  /**
   * Reorder categories
   */
  async reorder(
    categories: { id: number; sortOrder: number }[],
  ): Promise<{ message: string }> {
    const updates = categories.map((item) =>
      this.categoriesRepository.update(item.id, { sortOrder: item.sortOrder }),
    );

    await Promise.all(updates);

    return {
      message: `${categories.length} categories reordered successfully`,
    };
  }

  // ========== PRODUCT ASSIGNMENT ==========

  /**
   * Assign products to this category
   */
  async assignProducts(
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
   * Remove products from this category
   */
  async removeProducts(
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
   * Get products in this category with category info
   */
  async getProducts(
    categoryId: number,
  ): Promise<{ category: Category; products: Product[] }> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
      relations: ['parent'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Get products via junction table
    const productCategories = await this.productCategoriesRepository.find({
      where: { category_id: categoryId },
      relations: [
        'product',
        'product.vendor',
        'product.media',
        'product.priceGroups',
      ],
    });

    const products = productCategories
      .map((pc) => pc.product)
      .filter((p) => p && p.status === ProductStatus.ACTIVE);

    return {
      category,
      products,
    };
  }

  /**
   * Get archived products in this category (for restore selection)
   */
  async getArchivedProducts(categoryId: number): Promise<{
    category: Category;
    products: any[];
  }> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
      relations: ['parent'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Get products via junction table
    const productCategories = await this.productCategoriesRepository.find({
      where: { category_id: categoryId },
      relations: [
        'product',
        'product.vendor',
        'product.media',
        'product.priceGroups',
      ],
    });

    const products = productCategories
      .map((pc) => pc.product)
      .filter((p) => p && p.status === ProductStatus.ARCHIVED);

    // Add canRestore flag based on vendor status
    const productsWithRestoreInfo = products.map((product) => {
      const vendorArchived = product.vendor?.status === VendorStatus.ARCHIVED;

      const { ...productData } = product;
      return {
        ...productData,
        canRestore: !vendorArchived,
        blockedReason: vendorArchived ? 'Vendor is archived' : undefined,
      };
    });

    return {
      category,
      products: productsWithRestoreInfo,
    };
  }

  /**
   * Get archived subcategories for this category (for restore selection)
   */
  async getArchivedSubcategories(categoryId: number): Promise<{
    category: Category;
    subcategories: (Category & {
      archivedProductCount: number;
      archivedSubcategoryCount: number;
    })[];
  }> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Get archived direct children
    const subcategories = await this.categoriesRepository.find({
      where: { parent_id: categoryId, status: CategoryStatus.ARCHIVED },
      order: { sortOrder: 'ASC' },
    });

    // Add product and subcategory counts for each
    const subcategoriesWithCounts = await Promise.all(
      subcategories.map(async (subcat) => {
        // Count archived products in this subcategory
        const productCategories = await this.productCategoriesRepository.find({
          where: { category_id: subcat.id },
          select: ['product_id'],
        });
        const product_ids = productCategories.map((pc) => pc.product_id);

        let archivedProductCount = 0;
        if (product_ids.length > 0) {
          archivedProductCount = await this.productsRepository.count({
            where: { id: In(product_ids), status: ProductStatus.ARCHIVED },
          });
        }

        // Count archived subcategories
        const archivedSubcategoryCount = await this.categoriesRepository.count({
          where: { parent_id: subcat.id, status: CategoryStatus.ARCHIVED },
        });

        return {
          ...subcat,
          archivedProductCount,
          archivedSubcategoryCount,
        };
      }),
    );

    return {
      category,
      subcategories: subcategoriesWithCounts,
    };
  }
}
