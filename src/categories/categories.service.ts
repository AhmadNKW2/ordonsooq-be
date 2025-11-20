import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';

@Injectable()
export class CategoriesService {
    constructor(
        @InjectRepository(Category)
        private categoriesRepository: Repository<Category>,
    ) { }

    async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
        let level = 0;

        // If has parent, calculate level
        if (createCategoryDto.parentId) {
            const parent = await this.categoriesRepository.findOne({
                where: { id: createCategoryDto.parentId },
            });

            if (!parent) {
                throw new NotFoundException('Parent category not found');
            }

            // Check max nesting level (max 2 = sub-sub-category)
            if (parent.level >= 2) {
                throw new BadRequestException('Maximum nesting level reached (3 levels)');
            }

            level = parent.level + 1;
        }

        const category = this.categoriesRepository.create({
            ...createCategoryDto,
            level,
        });

        return await this.categoriesRepository.save(category);
    }

    async findAll(filterDto?: FilterCategoryDto) {
        const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC', isActive, parentId, level, search } = filterDto || {};

        const queryBuilder = this.categoriesRepository
            .createQueryBuilder('category')
            .leftJoinAndSelect('category.parent', 'parent')
            .leftJoinAndSelect('category.children', 'children');

        // Filter by isActive
        if (isActive !== undefined) {
            queryBuilder.andWhere('category.isActive = :isActive', { isActive });
        }

        // Filter by parentId
        if (parentId !== undefined) {
            if (parentId === null) {
                queryBuilder.andWhere('category.parentId IS NULL');
            } else {
                queryBuilder.andWhere('category.parentId = :parentId', { parentId });
            }
        }

        // Filter by level
        if (level !== undefined) {
            queryBuilder.andWhere('category.level = :level', { level });
        }

        // Search
        if (search) {
            queryBuilder.andWhere(
                '(category.name ILIKE :search OR category.description ILIKE :search)',
                { search: `%${search}%` }
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

    // Get only main categories (level 0)
    async findMainCategories(): Promise<Category[]> {
        return await this.categoriesRepository.find({
            where: { level: 0 },
            relations: ['children'],
            order: { name: 'ASC' },
        });
    }

    // Get full category tree
    async getCategoryTree(): Promise<Category[]> {
        const mainCategories = await this.categoriesRepository.find({
            where: { level: 0 },
            relations: ['children', 'children.children'],
            order: { name: 'ASC' },
        });

        return mainCategories;
    }

    async findOne(id: number): Promise<Category> {
        const category = await this.categoriesRepository.findOne({
            where: { id },
            relations: ['parent', 'children', 'products'],
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        return category;
    }

    async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
        const category = await this.findOne(id);

        Object.assign(category, updateCategoryDto);

        return await this.categoriesRepository.save(category);
    }

    async remove(id: number): Promise<void> {
        const category = await this.findOne(id);

        // Check if has children
        if (category.children && category.children.length > 0) {
            throw new BadRequestException('Cannot delete category with subcategories');
        }

        await this.categoriesRepository.remove(category);
    }
}