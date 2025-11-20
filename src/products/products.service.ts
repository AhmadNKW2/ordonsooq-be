import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, PricingType } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductDto } from './dto/filter-product.dto';
import { ProductVariantsService } from './product-variants.service';
import { ProductPricingService } from './product-pricing.service';
import { ProductMediaService } from './product-media.service';
import { ProductWeightService } from './product-weight.service';

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product)
        private productsRepository: Repository<Product>,
        private variantsService: ProductVariantsService,
        private pricingService: ProductPricingService,
        private mediaService: ProductMediaService,
        private weightService: ProductWeightService,
    ) { }

    async create(dto: CreateProductDto): Promise<any> {
        try {
            // 1. Create basic product
            const product = this.productsRepository.create({
                name_en: dto.name_en,
                name_ar: dto.name_ar,
                sku: dto.sku,
                short_description_en: dto.short_description_en,
                short_description_ar: dto.short_description_ar,
                long_description_en: dto.long_description_en,
                long_description_ar: dto.long_description_ar,
                pricing_type: dto.pricing_type,
                category_id: dto.category_id,
                vendor_id: dto.vendor_id,
                is_active: dto.is_active ?? true,
            });
            const savedProduct = await this.productsRepository.save(product);

            // 2. Add attributes if provided (generates stock combinations automatically)
            if (dto.attributes && dto.attributes.length > 0) {
                await this.variantsService.addProductAttributes(
                    savedProduct.id,
                    dto.attributes.map(attr => ({
                        attribute_id: attr.attribute_id,
                        controls_pricing: attr.controls_pricing,
                        controls_media: attr.controls_media,
                        controls_weight: attr.controls_weight,
                    })),
                );
            }

            // 3. Set pricing based on pricing type
            if (dto.pricing_type === PricingType.SINGLE && dto.single_pricing) {
                await this.pricingService.setSinglePricing(
                    savedProduct.id,
                    dto.single_pricing.cost,
                    dto.single_pricing.price,
                    dto.single_pricing.sale_price,
                );
            }

            // 4. Set product-level weight if provided
            if (dto.product_weight) {
                await this.weightService.setProductWeight(
                    savedProduct.id,
                    dto.product_weight.weight,
                    dto.product_weight.length,
                    dto.product_weight.width,
                    dto.product_weight.height,
                );
            }

            // Return the complete product
            const result = await this.findOne(savedProduct.id);
            return {
                product: result,
                message: dto.pricing_type === PricingType.VARIANT 
                    ? 'Product created with attributes. Use individual endpoints to set variant pricing, media, and stock for specific attribute value combinations.'
                    : 'Product created successfully with single pricing.',
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
            minPrice, 
            maxPrice, 
            minRating,
            maxRating,
            isActive, 
            search 
        } = filterDto;

        const queryBuilder = this.productsRepository
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.category', 'category');

        // Filter by isActive (only if explicitly provided)
        if (isActive !== undefined) {
            queryBuilder.andWhere('product.is_active = :isActive', { isActive });
        } else {
            queryBuilder.where('product.is_active = :isActive', { isActive: true });
        }

        // Filter by category
        if (categoryId) {
            queryBuilder.andWhere('product.category_id = :categoryId', { categoryId });
        }

        // Note: Price filtering removed - products use variant pricing system
        // To filter by price, query the product_pricing or product_variant_pricing tables

        // Filter by rating range
        if (minRating !== undefined) {
            queryBuilder.andWhere('product.average_rating >= :minRating', { minRating });
        }
        if (maxRating !== undefined) {
            queryBuilder.andWhere('product.average_rating <= :maxRating', { maxRating });
        }

        // Note: Stock filtering removed - use variant stock system instead

        // Search by name, sku, or descriptions
        if (search) {
            queryBuilder.andWhere(
                '(product.name_en ILIKE :search OR product.name_ar ILIKE :search OR product.sku ILIKE :search OR product.short_description_en ILIKE :search OR product.long_description_en ILIKE :search)',
                { search: `%${search}%` }
            );
        }

        // Sorting
        queryBuilder.orderBy(`product.${sortBy}`, sortOrder);

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

    async findOne(id: number): Promise<Product> {
        const product = await this.productsRepository.findOne({
            where: { id },
            relations: [
                'category',
                'vendor',
                'media',
                'pricing',
                'weight',
                'stock',
                'variant_pricing',
                'variant_media',
                'variant_weight',
                'attributes',
            ],
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }

    /**
     * Comprehensive update method for products
     * Handles: basic info, media management, attributes, pricing, weight, stock
     */
    async update(id: number, dto: UpdateProductDto): Promise<any> {
        const product = await this.findOne(id);
        const updates: string[] = [];

        try {
            // 1. Update basic product information (extract directly from dto)
            const basicInfoFields = ['name_en', 'name_ar', 'sku', 'short_description_en', 'short_description_ar', 'long_description_en', 'long_description_ar', 'pricing_type', 'category_id', 'vendor_id', 'is_active'];
            const basicInfoChanges: any = {};
            
            basicInfoFields.forEach(field => {
                if (dto[field] !== undefined) {
                    basicInfoChanges[field] = dto[field];
                }
            });

            if (Object.keys(basicInfoChanges).length > 0) {
                Object.assign(product, basicInfoChanges);
                await this.productsRepository.save(product);
                updates.push('Basic information updated');
            }

            // 2. Media management
            if (dto.media_management) {
                const mediaOps = dto.media_management;

                // Delete media
                if (mediaOps.delete_media && mediaOps.delete_media.length > 0) {
                    for (const media of mediaOps.delete_media) {
                        await this.mediaService.deleteMedia(
                            media.media_id,
                            media.is_variant ?? false,
                        );
                    }
                    updates.push(`Deleted ${mediaOps.delete_media.length} media item(s)`);
                }

                // Update media (sort order or primary status for individual items)
                if (mediaOps.update_media && mediaOps.update_media.length > 0) {
                    for (const media of mediaOps.update_media) {
                        if (media.sort_order !== undefined) {
                            await this.mediaService.updateSortOrder(
                                media.media_id,
                                media.sort_order,
                                false,
                            );
                        }
                        if (media.is_primary !== undefined && media.is_primary) {
                            await this.mediaService.setPrimaryMedia(media.media_id, false);
                        }
                    }
                    updates.push(`Updated ${mediaOps.update_media.length} media item(s)`);
                }

                // Reorder all media at once
                if (mediaOps.reorder_media && mediaOps.reorder_media.length > 0) {
                    for (const media of mediaOps.reorder_media) {
                        await this.mediaService.updateSortOrder(
                            media.media_id,
                            media.sort_order,
                            false,
                        );
                    }
                    updates.push(`Reordered ${mediaOps.reorder_media.length} media item(s)`);
                }

                // Set primary media
                if (mediaOps.set_primary_media_id) {
                    await this.mediaService.setPrimaryMedia(
                        mediaOps.set_primary_media_id,
                        mediaOps.is_variant_media ?? false,
                    );
                    updates.push('Primary media updated');
                }
            }

            // 3. Attributes management
            if (dto.add_attributes && dto.add_attributes.length > 0) {
                await this.variantsService.addProductAttributes(id, dto.add_attributes);
                updates.push(`Added ${dto.add_attributes.length} attribute(s)`);
            }

            if (dto.update_attributes && dto.update_attributes.length > 0) {
                for (const attr of dto.update_attributes) {
                    await this.variantsService.updateProductAttribute(attr.attribute_id, {
                        controls_pricing: attr.controls_pricing,
                        controls_media: attr.controls_media,
                        controls_weight: attr.controls_weight,
                    });
                }
                updates.push(`Updated ${dto.update_attributes.length} attribute(s)`);
            }

            if (dto.delete_attribute_ids && dto.delete_attribute_ids.length > 0) {
                for (const attrId of dto.delete_attribute_ids) {
                    await this.variantsService.removeProductAttribute(attrId);
                }
                updates.push(`Deleted ${dto.delete_attribute_ids.length} attribute(s)`);
            }

            // 4. Pricing updates
            if (dto.single_pricing) {
                const pricing = dto.single_pricing;
                // Get current pricing to merge
                const existingPricing = await this.pricingService.getPricing(id);
                
                await this.pricingService.setSinglePricing(
                    id,
                    pricing.cost ?? existingPricing?.cost ?? 0,
                    pricing.price ?? existingPricing?.price ?? 0,
                    pricing.sale_price,
                );
                updates.push('Single pricing updated');
            }

            if (dto.variant_pricing && dto.variant_pricing.length > 0) {
                for (const vp of dto.variant_pricing) {
                    // Note: This requires resolving combination to attribute_value_id
                    // Extended implementation needed based on how combinations are stored
                    // For now, this is a placeholder
                    updates.push('Variant pricing updates require attribute value resolution');
                }
            }

            // 5. Weight updates
            if (dto.product_weight) {
                const weight = dto.product_weight;
                // Only update if weight is provided (required field)
                if (weight.weight !== undefined) {
                    await this.weightService.setProductWeight(
                        id,
                        weight.weight,
                        weight.length,
                        weight.width,
                        weight.height,
                    );
                    updates.push('Product weight updated');
                }
            }

            if (dto.variant_weights && dto.variant_weights.length > 0) {
                updates.push('Variant weight updates require attribute value resolution');
            }

            // 6. Stock updates
            if (dto.stock && dto.stock.length > 0) {
                updates.push('Stock updates require attribute value resolution');
            }

            // Return updated product with summary
            const updatedProduct = await this.findOne(id);
            return {
                product: updatedProduct,
                updates,
                message: 'Product updated successfully',
            };

        } catch (error) {
            throw new BadRequestException(
                `Failed to update product: ${error.message}`,
            );
        }
    }

    async remove(id: number): Promise<void> {
        const product = await this.findOne(id);
        await this.productsRepository.remove(product);
    }



    // Update average rating (called when rating is added/updated)
    async updateAverageRating(productId: number): Promise<void> {
        const result = await this.productsRepository
            .createQueryBuilder('product')
            .leftJoin('product.ratings', 'rating')
            .where('product.id = :productId', { productId })
            .andWhere('rating.status = :status', { status: 'approved' })
            .select('AVG(rating.rating)', 'avg')
            .addSelect('COUNT(rating.id)', 'count')
            .getRawOne();

        await this.productsRepository.update(productId, {
            average_rating: parseFloat(result.avg) || 0,
            total_ratings: parseInt(result.count) || 0,
        });
    }
}