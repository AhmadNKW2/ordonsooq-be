import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Banner } from './entities/banner.entity';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { FilterBannerDto } from './dto/filter-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { R2StorageService } from '../common/services/r2-storage.service';

@Injectable()
export class BannersService {
    private readonly logger = new Logger(BannersService.name);

    constructor(
        @InjectRepository(Banner)
        private bannersRepository: Repository<Banner>,
        private r2StorageService: R2StorageService,
    ) { }

    async create(createBannerDto: CreateBannerDto, imageUrl: string): Promise<Banner> {
        // Get max sort_order and add 1
        const maxSortOrder = await this.bannersRepository
            .createQueryBuilder('banner')
            .select('MAX(banner.sort_order)', 'max')
            .getRawOne();

        const sortOrder = (maxSortOrder?.max || 0) + 1;

        const bannerData: Partial<Banner> = {
            sort_order: sortOrder,
            image: imageUrl,
            language: createBannerDto.language,
            visible: createBannerDto.visible !== undefined ? createBannerDto.visible : true,
        };

        if (createBannerDto.link) {
            bannerData.link = createBannerDto.link;
        }

        const banner = this.bannersRepository.create(bannerData);
        const savedBanner = await this.bannersRepository.save(banner);
        return savedBanner as Banner;
    }

    async findAll(filterDto?: FilterBannerDto) {
        const { page = 1, limit = 10, sortBy = 'sort_order', sortOrder = 'ASC', visible, language } = filterDto || {};

        const queryBuilder = this.bannersRepository
            .createQueryBuilder('banner');

        // Filter by visible
        if (visible !== undefined) {
            queryBuilder.where('banner.visible = :visible', { visible });
        }

        // Filter by language
        if (language !== undefined) {
            queryBuilder.andWhere('banner.language = :language', { language });
        }

        // Sorting
        queryBuilder.orderBy(`banner.${sortBy}`, sortOrder);

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

    async findOne(id: number): Promise<Banner> {
        const banner = await this.bannersRepository.findOne({
            where: { id },
        });

        if (!banner) {
            throw new NotFoundException('Banner not found');
        }

        return banner;
    }

    async update(
        id: number,
        updateBannerDto: UpdateBannerDto,
        imageUrl?: string,
    ): Promise<Banner> {
        const banner = await this.findOne(id);
        const oldImageUrl = banner.image;

        Object.assign(banner, updateBannerDto);

        if (imageUrl) {
            banner.image = imageUrl;
        }

        const savedBanner = await this.bannersRepository.save(banner);

        // Delete old image from R2 if a new one was uploaded
        if (imageUrl && oldImageUrl) {
            try {
                await this.r2StorageService.deleteFile(oldImageUrl);
            } catch (error) {
                this.logger.warn(`Failed to delete old banner image: ${oldImageUrl}`, error);
            }
        }

        return savedBanner;
    }

    async reorder(dto: ReorderBannersDto): Promise<void> {
        const { banner_ids } = dto;

        // Update sort_order for each banner
        for (let i = 0; i < banner_ids.length; i++) {
            await this.bannersRepository.update(banner_ids[i], { sort_order: i + 1 });
        }
    }

    async remove(id: number): Promise<void> {
        const banner = await this.findOne(id);
        const imageUrl = banner.image;
        
        await this.bannersRepository.remove(banner);

        // Delete images from R2
        if (imageUrl) {
            try {
                await this.r2StorageService.deleteFile(imageUrl);
            } catch (error) {
                this.logger.warn(`Failed to delete banner image: ${imageUrl}`, error);
            }
        }
    }
}