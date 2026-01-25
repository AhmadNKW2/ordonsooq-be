import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, Like } from 'typeorm';
import { Brand, BrandStatus } from './entities/brand.entity';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { FilterBrandDto } from './dto/filter-brand.dto';
import { Product, ProductStatus } from '../products/entities/product.entity';
import {
  RestoreBrandDto,
  PermanentDeleteBrandDto,
} from './dto/archive-brand.dto';
import { R2StorageService } from '../common/services/r2-storage.service';

@Injectable()
export class BrandsService {
  private readonly logger = new Logger(BrandsService.name);

  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepository: Repository<Brand>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly r2StorageService: R2StorageService,
  ) {}

  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }

  private async generateUniqueSlug(
    name: string,
    currentId?: number,
  ): Promise<string> {
    const baseSlug = this.slugify(name);
    let finalSlug = baseSlug;
    let counter = 1;

    const existing = await this.brandsRepository.find({
      select: ['slug', 'id'],
      where: {
        slug: Like(`${baseSlug}%`),
      },
    });

    const isAvailable = (slug: string) => {
      const match = existing.find((b) => b.slug === slug);
      if (!match) return true;
      if (currentId && match.id === currentId) return true;
      return false;
    };

    while (!isAvailable(finalSlug)) {
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
    }

    return finalSlug;
  }

  async create(dto: CreateBrandDto, logoUrl?: string): Promise<Brand> {
    const existing = await this.brandsRepository.findOne({
      where: [{ name_en: dto.name_en }, { name_ar: dto.name_ar }],
    });
    if (existing) {
      throw new BadRequestException('Brand with same name already exists');
    }

    const { product_ids, ...rest } = dto;
    const slug = await this.generateUniqueSlug(rest.name_en);

    const brand = this.brandsRepository.create({
      ...rest,
      slug,
      logo: logoUrl ?? rest.logo,
      status: rest.status ?? BrandStatus.ACTIVE,
      visible: rest.visible ?? true,
      sort_order: rest.sort_order ?? 0,
    });

    const savedBrand = await this.brandsRepository.save(brand);

    if (product_ids !== undefined) {
      await this.syncProductsToBrand(savedBrand.id, product_ids);
    }

    return savedBrand;
  }

  async findAll(filterDto?: FilterBrandDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'sort_order',
      sortOrder = 'ASC',
      status = BrandStatus.ACTIVE,
      visible,
      search,
    } = filterDto || {};

    const where: any = { status };
    if (visible !== undefined) {
      where.visible = visible;
    }

    // Apply OR search on name_en/name_ar when provided
    let searchWhere: any | undefined;
    if (search) {
      searchWhere = [
        { ...where, name_en: ILike(`%${search}%`) },
        { ...where, name_ar: ILike(`%${search}%`) },
      ];
    }

    const [data, total] = await this.brandsRepository.findAndCount({
      where: searchWhere || where,
      relations: ['products'],
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
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

  async findOne(id: number): Promise<Brand> {
    const brand = await this.brandsRepository.findOne({
      where: { id },
      relations: ['products'],
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return brand;
  }

  async update(
    id: number,
    dto: UpdateBrandDto,
    logoUrl?: string,
  ): Promise<Brand> {
    const brand = await this.findOne(id);
    const oldLogoUrl = brand.logo;

    // Check for name conflicts
    if (dto.name_en || dto.name_ar) {
      const conflict = await this.brandsRepository.findOne({
        where: [
          dto.name_en ? { name_en: dto.name_en } : undefined,
          dto.name_ar ? { name_ar: dto.name_ar } : undefined,
        ].filter(Boolean) as any,
      });
      if (conflict && conflict.id !== id) {
        throw new BadRequestException('Brand with same name already exists');
      }
    }

    // If setting status to archived, enforce archive flow via dedicated endpoint
    if (dto.status === BrandStatus.ARCHIVED) {
      throw new BadRequestException('Use archive endpoint to archive a brand');
    }

    const { product_ids, ...rest } = dto;

    Object.assign(brand, rest);
    if (logoUrl) {
      brand.logo = logoUrl;
    }

    const savedBrand = await this.brandsRepository.save(brand);

    // Delete old logo from R2 if a new one was uploaded
    if (logoUrl && oldLogoUrl) {
      try {
        await this.r2StorageService.deleteFile(oldLogoUrl);
      } catch (error) {
        this.logger.warn(
          `Failed to delete old brand logo: ${oldLogoUrl}`,
          error,
        );
      }
    }

    if (product_ids !== undefined) {
      await this.syncProductsToBrand(id, product_ids);
    }

    return savedBrand;
  }

  private async syncProductsToBrand(
    brandId: number,
    product_ids: number[],
  ): Promise<void> {
    // Remove this brand from existing products
    await this.productsRepository.update(
      { brand_id: brandId },
      { brand_id: null as any },
    );

    if (!product_ids || product_ids.length === 0) return;

    await this.productsRepository.update(
      { id: In(product_ids), status: ProductStatus.ACTIVE },
      { brand_id: brandId },
    );
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  async archive(
    id: number,
    userId: number,
  ): Promise<{ message: string; archivedProducts: number }> {
    const brand = await this.brandsRepository.findOne({
      where: { id, status: BrandStatus.ACTIVE },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found or already archived');
    }

    await this.brandsRepository.update(id, {
      status: BrandStatus.ARCHIVED,
      archived_at: new Date(),
      archived_by: userId,
    });

    const productResult = await this.productsRepository.update(
      { brand_id: id, status: ProductStatus.ACTIVE },
      {
        status: ProductStatus.ARCHIVED,
        archived_at: new Date(),
        archived_by: userId,
      },
    );

    return {
      message: `Brand "${brand.name_en}" archived successfully`,
      archivedProducts: productResult.affected || 0,
    };
  }

  async restore(
    id: number,
    restoreDto?: RestoreBrandDto,
  ): Promise<{
    message: string;
    restoredProducts: number;
    skippedProducts: number;
    skippedReason?: string;
  }> {
    const brand = await this.brandsRepository.findOne({
      where: { id, status: BrandStatus.ARCHIVED },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found or not archived');
    }

    brand.status = BrandStatus.ACTIVE;
    brand.archived_at = null;
    brand.archived_by = null;
    await this.brandsRepository.save(brand);

    let restoredProducts = 0;
    let skippedProducts = 0;
    let skippedReason: string | undefined;

    if (restoreDto?.restoreAllProducts || restoreDto?.product_ids) {
      let productsQuery = this.productsRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.productCategories', 'pc')
        .leftJoinAndSelect('pc.category', 'category')
        .where('product.brand_id = :brandId', { brandId: id })
        .andWhere('product.status = :status', {
          status: ProductStatus.ARCHIVED,
        });

      if (restoreDto.product_ids && restoreDto.product_ids.length > 0) {
        productsQuery = productsQuery.andWhere(
          'product.id IN (:...product_ids)',
          {
            product_ids: restoreDto.product_ids,
          },
        );
      }

      const products = await productsQuery.getMany();

      for (const product of products) {
        const hasActiveCategory = product.productCategories?.some(
          (pc) => pc.category?.status === 'active',
        );

        if (!hasActiveCategory && product.productCategories?.length > 0) {
          skippedProducts++;
          skippedReason =
            'Some products skipped because all their categories are archived';
          continue;
        }

        product.status = ProductStatus.ACTIVE;
        product.archived_at = null;
        product.archived_by = null;
        await this.productsRepository.save(product);
        restoredProducts++;
      }
    }

    return {
      message: `Brand "${brand.name_en}" restored successfully`,
      restoredProducts,
      skippedProducts,
      skippedReason,
    };
  }

  async findArchived(): Promise<any[]> {
    const brands = await this.brandsRepository.find({
      where: { status: BrandStatus.ARCHIVED },
      order: { archived_at: 'DESC' },
    });

    const brandsWithProducts = await Promise.all(
      brands.map(async (brand) => {
        const archivedProductsRaw = await this.productsRepository.find({
          where: { brand_id: brand.id, status: ProductStatus.ARCHIVED },
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

        const archivedProducts = archivedProductsRaw.map((product) => {
          const primaryMedia = product.media?.find((m) => m.is_primary);
          const firstMedia = product.media?.[0];
          const image = primaryMedia?.url || firstMedia?.url || null;
          const { media, ...productData } = product as any;
          return { ...productData, image };
        });

        return {
          ...brand,
          archivedProducts,
        };
      }),
    );

    return brandsWithProducts;
  }

  async permanentDelete(
    id: number,
    options?: PermanentDeleteBrandDto,
  ): Promise<{ message: string }> {
    const brand = await this.brandsRepository.findOne({
      where: { id, status: BrandStatus.ARCHIVED },
    });

    if (!brand) {
      throw new NotFoundException(
        'Brand not found or not archived. Only archived brands can be permanently deleted.',
      );
    }

    const archivedProductCount = await this.productsRepository.count({
      where: { brand_id: id, status: ProductStatus.ARCHIVED },
    });

    const activeProductCount = await this.productsRepository.count({
      where: { brand_id: id, status: ProductStatus.ACTIVE },
    });

    if (activeProductCount > 0) {
      throw new BadRequestException(
        `Brand has ${activeProductCount} active products. Archive them first before permanent deletion.`,
      );
    }

    if (archivedProductCount > 0) {
      if (!options?.deleteProducts && !options?.moveProductsToBrandId) {
        throw new BadRequestException(
          `Brand has ${archivedProductCount} archived products. Choose one option:\n` +
            '1. Set deleteProducts=true to permanently delete all products\n' +
            '2. Set moveProductsToBrandId=<id> to move products to another brand',
        );
      }

      if (options.deleteProducts && options.moveProductsToBrandId) {
        throw new BadRequestException(
          'Cannot use both deleteProducts and moveProductsToBrandId. Choose one option.',
        );
      }

      if (options.moveProductsToBrandId) {
        const targetBrand = await this.brandsRepository.findOne({
          where: {
            id: options.moveProductsToBrandId,
            status: BrandStatus.ACTIVE,
          },
        });

        if (!targetBrand) {
          throw new BadRequestException(
            'Target brand not found or is archived',
          );
        }

        await this.productsRepository.update(
          { brand_id: id },
          { brand_id: options.moveProductsToBrandId },
        );
      } else if (options.deleteProducts) {
        await this.productsRepository.delete({
          brand_id: id,
          status: ProductStatus.ARCHIVED,
        });
      }
    }

    const logoUrl = brand.logo;

    await this.brandsRepository.delete(id);

    // Delete logo from R2
    if (logoUrl) {
      try {
        await this.r2StorageService.deleteFile(logoUrl);
      } catch (error) {
        this.logger.warn(`Failed to delete brand logo: ${logoUrl}`, error);
      }
    }

    return { message: `Brand "${brand.name_en}" permanently deleted` };
  }

  async remove(id: number): Promise<void> {
    throw new BadRequestException('Use permanent delete endpoint for brands');
  }
}
