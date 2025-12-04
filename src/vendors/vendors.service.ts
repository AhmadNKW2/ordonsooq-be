import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Vendor, VendorStatus } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { RestoreVendorDto, PermanentDeleteVendorDto } from './dto/archive-vendor.dto';
import { ReorderVendorsDto } from './dto/reorder-vendors.dto';
import { Product, ProductStatus } from '../products/entities/product.entity';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async create(createVendorDto: CreateVendorDto, logoUrl?: string): Promise<Vendor> {
    const existing = await this.vendorRepository.findOne({
      where: { name_en: createVendorDto.name_en },
    });

    if (existing) {
      throw new ConflictException('Vendor with this name already exists');
    }

    // Get max sort_order and add 1
    const maxSortOrder = await this.vendorRepository
      .createQueryBuilder('vendor')
      .select('MAX(vendor.sort_order)', 'max')
      .getRawOne();
    
    const nextSortOrder = (maxSortOrder?.max ?? -1) + 1;

    const { product_ids, ...vendorData } = createVendorDto;

    const vendor = this.vendorRepository.create({
      ...vendorData,
      logo: logoUrl,
      sort_order: nextSortOrder,
    });
    const savedVendor = await this.vendorRepository.save(vendor);

    // Assign products if provided
    if (product_ids && product_ids.length > 0) {
      await this.syncProductsToVendor(savedVendor.id, product_ids);
    }

    return savedVendor;
  }

  /**
   * Sync products to a vendor - replaces vendor assignment for specified products
   */
  private async syncProductsToVendor(vendorId: number, product_ids: number[]): Promise<void> {
    // First, remove this vendor from all products that currently have it
    await this.productsRepository.update(
      { vendor_id: vendorId },
      { vendor_id: null as any },
    );

    if (product_ids.length === 0) return;

    // Assign this vendor to the specified products
    await this.productsRepository.update(
      { id: In(product_ids), status: ProductStatus.ACTIVE },
      { vendor_id: vendorId },
    );
  }

  async findAll(): Promise<Vendor[]> {
    return await this.vendorRepository.find({
      where: { status: VendorStatus.ACTIVE },
      order: { sort_order: 'ASC', created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Vendor> {
    const vendor = await this.vendorRepository.findOne({
      where: { id },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${id} not found`);
    }

    return vendor;
  }

  async update(id: number, updateVendorDto: UpdateVendorDto, logoUrl?: string): Promise<Vendor> {
    const vendor = await this.findOne(id);

    if (updateVendorDto.name_en && updateVendorDto.name_en !== vendor.name_en) {
      const existing = await this.vendorRepository.findOne({
        where: { name_en: updateVendorDto.name_en },
      });
      if (existing) {
        throw new ConflictException('Vendor with this name already exists');
      }
    }

    const { product_ids, ...updateData } = updateVendorDto;

    Object.assign(vendor, updateData);
    if (logoUrl) {
      vendor.logo = logoUrl;
    }
    const savedVendor = await this.vendorRepository.save(vendor);

    // Sync products if provided
    if (product_ids !== undefined) {
      await this.syncProductsToVendor(id, product_ids);
    }

    return savedVendor;
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  /**
   * Archive a vendor (soft delete)
   * All products from this vendor will also be archived
   */
  async archive(id: number, userId: number): Promise<{ message: string; archivedProducts: number }> {
    const vendor = await this.vendorRepository.findOne({
      where: { id, status: VendorStatus.ACTIVE },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found or already archived');
    }

    // Archive the vendor
    await this.vendorRepository.update(id, {
      status: VendorStatus.ARCHIVED,
      archived_at: new Date(),
      archived_by: userId,
    });

    // Archive all products from this vendor
    const productResult = await this.productsRepository.update(
      { vendor_id: id, status: ProductStatus.ACTIVE },
      {
        status: ProductStatus.ARCHIVED,
        archived_at: new Date(),
        archived_by: userId,
      }
    );

    return {
      message: `Vendor "${vendor.name_en}" archived successfully`,
      archivedProducts: productResult.affected || 0,
    };
  }

  /**
   * Restore an archived vendor
   * Options to restore all products, select specific products, or restore vendor only
   */
  async restore(id: number, restoreDto?: RestoreVendorDto): Promise<{ 
    message: string; 
    restoredProducts: number;
    skippedProducts: number;
    skippedReason?: string;
  }> {
    const vendor = await this.vendorRepository.findOne({
      where: { id, status: VendorStatus.ARCHIVED },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found or not archived');
    }

    // Restore the vendor first
    vendor.status = VendorStatus.ACTIVE;
    vendor.archived_at = null;
    vendor.archived_by = null;
    await this.vendorRepository.save(vendor);

    let restoredProducts = 0;
    let skippedProducts = 0;
    let skippedReason: string | undefined;

    // Handle product restoration based on options
    if (restoreDto?.restoreAllProducts || restoreDto?.product_ids) {
      // Get archived products for this vendor
      let productsQuery = this.productsRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.productCategories', 'pc')
        .leftJoinAndSelect('pc.category', 'category')
        .where('product.vendor_id = :vendorId', { vendorId: id })
        .andWhere('product.status = :status', { status: ProductStatus.ARCHIVED });

      // If specific product IDs provided, filter by them
      if (restoreDto.product_ids && restoreDto.product_ids.length > 0) {
        productsQuery = productsQuery.andWhere('product.id IN (:...product_ids)', { 
          product_ids: restoreDto.product_ids 
        });
      }

      const products = await productsQuery.getMany();

      for (const product of products) {
        // Check if product has at least one active category
        const hasActiveCategory = product.productCategories?.some(
          pc => pc.category?.status === 'active'
        );

        if (!hasActiveCategory && product.productCategories?.length > 0) {
          skippedProducts++;
          skippedReason = 'Some products skipped because all their categories are archived';
          continue;
        }

        // Restore the product
        product.status = ProductStatus.ACTIVE;
        product.archived_at = null;
        product.archived_by = null;
        await this.productsRepository.save(product);
        restoredProducts++;
      }
    }

    return { 
      message: `Vendor "${vendor.name_en}" restored successfully`,
      restoredProducts,
      skippedProducts,
      skippedReason,
    };
  }

  /**
   * Find all archived vendors with their archived products included
   */
  async findArchived(): Promise<any[]> {
    const vendors = await this.vendorRepository.find({
      where: { status: VendorStatus.ARCHIVED },
      order: { archived_at: 'DESC' },
    });

    // Include archived products for each vendor with media
    const vendorsWithProducts = await Promise.all(
      vendors.map(async (vendor) => {
        const archivedProductsRaw = await this.productsRepository.find({
          where: { vendor_id: vendor.id, status: ProductStatus.ARCHIVED },
          select: ['id', 'name_en', 'name_ar', 'sku', 'archived_at', 'archived_by'],
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

        return {
          ...vendor,
          archivedProducts,
        };
      })
    );

    return vendorsWithProducts;
  }

  /**
   * Permanently delete a vendor (only if archived)
   * Must handle products: delete them or move to another vendor
   */
  async permanentDelete(id: number, options?: PermanentDeleteVendorDto): Promise<{ message: string }> {
    const vendor = await this.vendorRepository.findOne({
      where: { id, status: VendorStatus.ARCHIVED },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found or not archived. Only archived vendors can be permanently deleted.');
    }

    // Count products
    const archivedProductCount = await this.productsRepository.count({
      where: { vendor_id: id, status: ProductStatus.ARCHIVED },
    });

    const activeProductCount = await this.productsRepository.count({
      where: { vendor_id: id, status: ProductStatus.ACTIVE },
    });

    // Active products cannot be permanently deleted
    if (activeProductCount > 0) {
      throw new BadRequestException(
        `Vendor has ${activeProductCount} active products. Archive them first before permanent deletion.`
      );
    }

    if (archivedProductCount > 0) {
      if (!options?.deleteProducts && !options?.moveProductsToVendorId) {
        throw new BadRequestException(
          `Vendor has ${archivedProductCount} archived products. Choose one option:\n` +
          '1. Set deleteProducts=true to permanently delete all products\n' +
          '2. Set moveProductsToVendorId=<id> to move products to another vendor'
        );
      }

      if (options.deleteProducts && options.moveProductsToVendorId) {
        throw new BadRequestException(
          'Cannot use both deleteProducts and moveProductsToVendorId. Choose one option.'
        );
      }

      if (options.moveProductsToVendorId) {
        // Validate target vendor exists and is active
        const targetVendor = await this.vendorRepository.findOne({
          where: { id: options.moveProductsToVendorId, status: VendorStatus.ACTIVE },
        });

        if (!targetVendor) {
          throw new BadRequestException('Target vendor not found or is archived');
        }

        // Move products to target vendor (keep them archived)
        await this.productsRepository.update(
          { vendor_id: id },
          { vendor_id: options.moveProductsToVendorId }
        );
      } else if (options.deleteProducts) {
        // Permanently delete all archived products
        await this.productsRepository.delete({ vendor_id: id, status: ProductStatus.ARCHIVED });
      }
    }

    // Perform hard delete of vendor
    await this.vendorRepository.delete(id);

    return { message: `Vendor "${vendor.name_en}" permanently deleted` };
  }

  /**
   * Reorder vendors
   */
  async reorder(dto: ReorderVendorsDto): Promise<{ message: string }> {
    const updates = dto.vendors.map(item =>
      this.vendorRepository.update(item.id, { sort_order: item.sort_order })
    );

    await Promise.all(updates);

    return { message: `${dto.vendors.length} vendors reordered successfully` };
  }

  // ========== PRODUCT ASSIGNMENT ==========

  /**
   * Assign products to this vendor
   */
  async assignProducts(
    vendorId: number,
    product_ids: number[],
  ): Promise<{ message: string; updated: number }> {
    // Validate vendor exists and is active
    const vendor = await this.vendorRepository.findOne({
      where: { id: vendorId, status: VendorStatus.ACTIVE },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found or is archived');
    }

    // Update products to assign this vendor
    const result = await this.productsRepository.update(
      { id: In(product_ids), status: ProductStatus.ACTIVE },
      { vendor_id: vendorId },
    );

    return {
      message: `${result.affected} products assigned to vendor "${vendor.name_en}"`,
      updated: result.affected || 0,
    };
  }

  /**
   * Remove products from this vendor (set vendor_id to null)
   */
  async removeProducts(
    vendorId: number,
    product_ids: number[],
  ): Promise<{ message: string; updated: number }> {
    // Validate vendor exists
    const vendor = await this.vendorRepository.findOne({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    // Remove vendor from products
    const result = await this.productsRepository.update(
      { id: In(product_ids), vendor_id: vendorId },
      { vendor_id: null as any },
    );

    return {
      message: `${result.affected} products removed from vendor "${vendor.name_en}"`,
      updated: result.affected || 0,
    };
  }

  /**
   * Get products for this vendor with vendor info
   */
  async getProducts(vendorId: number): Promise<{ vendor: Vendor; products: Product[] }> {
    const vendor = await this.vendorRepository.findOne({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const products = await this.productsRepository.find({
      where: { vendor_id: vendorId, status: ProductStatus.ACTIVE },
      relations: ['media', 'priceGroups', 'productCategories', 'productCategories.category'],
      order: { created_at: 'DESC' },
    });

    return {
      vendor,
      products,
    };
  }

  /**
   * Get archived products for this vendor (for restore selection)
   */
  async getArchivedProducts(vendorId: number): Promise<{ 
    vendor: Vendor; 
    products: any[];
  }> {
    const vendor = await this.vendorRepository.findOne({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const products = await this.productsRepository.find({
      where: { vendor_id: vendorId, status: ProductStatus.ARCHIVED },
      relations: ['media', 'priceGroups', 'productCategories', 'productCategories.category'],
      order: { archived_at: 'DESC' },
    });

    // Add canRestore flag based on category status
    const productsWithRestoreInfo = products.map(product => {
      const hasActiveCategory = product.productCategories?.some(
        pc => pc.category?.status === 'active'
      );
      
      const { ...productData } = product;
      return {
        ...productData,
        canRestore: hasActiveCategory || (product.productCategories?.length === 0),
        blockedReason: !hasActiveCategory && product.productCategories?.length > 0 
          ? 'All categories are archived' 
          : undefined,
      };
    });

    return {
      vendor,
      products: productsWithRestoreInfo,
    };
  }
}
