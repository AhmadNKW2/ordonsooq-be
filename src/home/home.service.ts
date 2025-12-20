import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Category,
  CategoryStatus,
} from '../categories/entities/category.entity';
import { Vendor, VendorStatus } from '../vendors/entities/vendor.entity';
import { Banner } from '../banners/entities/banner.entity';
import { Brand, BrandStatus } from '../brands/entities/brand.entity';

@Injectable()
export class HomeService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Vendor)
    private vendorsRepository: Repository<Vendor>,
    @InjectRepository(Banner)
    private bannersRepository: Repository<Banner>,
    @InjectRepository(Brand)
    private brandsRepository: Repository<Brand>,
  ) {}

  async getHomeData() {
    // Get active categories ordered by sortOrder
    const categories = await this.categoriesRepository.find({
      where: {
        status: CategoryStatus.ACTIVE,
        visible: true,
      },
      order: { sortOrder: 'ASC' },
      select: ['id', 'name_en', 'name_ar', 'image', 'level', 'sortOrder'],
    });

    // Get active vendors ordered by sort_order
    const vendors = await this.vendorsRepository.find({
      where: {
        status: VendorStatus.ACTIVE,
        visible: true,
      },
      order: { sort_order: 'ASC' },
      select: ['id', 'name_en', 'name_ar', 'logo', 'sort_order'],
    });

    // Get active banners ordered by sort_order
    const banners = await this.bannersRepository.find({
      where: {
        visible: true,
      },
      order: { sort_order: 'ASC' },
      select: ['id', 'image', 'language', 'link', 'sort_order'],
    });

    // Get active brands ordered by sort_order
    const brands = await this.brandsRepository.find({
      where: {
        status: BrandStatus.ACTIVE,
        visible: true,
      },
      order: { sort_order: 'ASC' },
      select: ['id', 'name_en', 'name_ar', 'logo', 'sort_order'],
    });

    return {
      categories,
      vendors,
      banners,
      brands,
    };
  }
}
