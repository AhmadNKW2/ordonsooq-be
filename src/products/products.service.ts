import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductDto } from './dto/filter-product.dto';
import { ProductVariantsService } from './product-variants.service';
import { ProductPriceGroupService } from './product-price-group.service';
import { ProductMediaGroupService } from './product-media-group.service';
import { ProductWeightGroupService } from './product-weight-group.service';

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product)
        private productsRepository: Repository<Product>,
        private variantsService: ProductVariantsService,
        private priceGroupService: ProductPriceGroupService,
        private mediaGroupService: ProductMediaGroupService,
        private weightGroupService: ProductWeightGroupService,
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
                category_id: dto.category_id,
                vendor_id: dto.vendor_id,
                is_active: dto.is_active ?? true,
            });
            const savedProduct = await this.productsRepository.save(product);

            // Determine if this is a variant product based on attributes
            const isVariantProduct = dto.attributes && dto.attributes.length > 0;

            // 2. Add attributes if provided
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

            // 3. Handle prices (unified - works for both simple and variant)
            if (dto.prices && dto.prices.length > 0) {
                for (const priceItem of dto.prices) {
                    const hasCombination = priceItem.combination && Object.keys(priceItem.combination).length > 0;
                    
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

            // 4. Handle weights (unified - works for both simple and variant)
            if (dto.weights && dto.weights.length > 0) {
                for (const weightItem of dto.weights) {
                    const hasCombination = weightItem.combination && Object.keys(weightItem.combination).length > 0;
                    
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

            // 5. Handle stocks (unified - works for both simple and variant)
            if (dto.stocks && dto.stocks.length > 0) {
                for (const stockItem of dto.stocks) {
                    const hasCombination = stockItem.combination && Object.keys(stockItem.combination).length > 0;
                    
                    if (hasCombination) {
                        await this.variantsService.setStockByCombination(
                            savedProduct.id,
                            stockItem.combination!,
                            stockItem.quantity,
                        );
                    } else {
                        await this.variantsService.setSimpleStock(savedProduct.id, stockItem.quantity);
                    }
                }
            }

            // 6. Handle media (link pre-uploaded media to product)
            if (dto.media && dto.media.length > 0) {
                await this.mediaGroupService.syncProductMedia(savedProduct.id, dto.media);
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

        // Filter by rating range
        if (minRating !== undefined) {
            queryBuilder.andWhere('product.average_rating >= :minRating', { minRating });
        }
        if (maxRating !== undefined) {
            queryBuilder.andWhere('product.average_rating <= :maxRating', { maxRating });
        }

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

        // Add relations for full product info
        queryBuilder
            .leftJoinAndSelect('product.vendor', 'vendor')
            .leftJoinAndSelect('product.media', 'media')
            .leftJoinAndSelect('product.stock', 'stock')
            .leftJoinAndSelect('product.priceGroups', 'priceGroups')
            .leftJoinAndSelect('priceGroups.groupValues', 'priceGroupValues');

        const [data, total] = await queryBuilder.getManyAndCount();

        // Transform each product to include primary_image and simplified structure
        const transformedData = data.map(product => this.transformProductListItem(product));

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
        const { media, priceGroups, stock, ...rest } = product as any;

        // Find primary image or first image
        const primaryImage = media?.find((m: any) => m.is_primary) || media?.[0] || null;

        // Get the base price (first price group with no combination or lowest price)
        const simplePrice = priceGroups?.find((pg: any) => !pg.groupValues || pg.groupValues.length === 0);
        const basePrice = simplePrice || priceGroups?.[0] || null;

        // Get total stock quantity
        const totalStock = stock?.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0) || 0;
        const hasStock = totalStock > 0;

        return {
            ...rest,
            primary_image: primaryImage ? {
                id: primaryImage.id,
                url: primaryImage.url,
                type: primaryImage.type,
                alt_text: primaryImage.alt_text,
            } : null,
            price: basePrice?.price || null,
            sale_price: basePrice?.sale_price || null,
            stock: {
                total_quantity: totalStock,
                in_stock: hasStock,
            },
        };
    }

    async findOne(id: number): Promise<any> {
        const product = await this.productsRepository.findOne({
            where: { id },
            relationLoadStrategy: 'query',
            relations: [
                'category',
                'vendor',
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
     * - Remove mediaGroups from response
     */
    private transformProductResponse(product: Product): any {
        const { priceGroups, weightGroups, media, ...rest } = product as any;

        // Transform media to include mediaGroup object and remove media_group_id
        const transformedMedia = media?.map((m: any) => {
            const { media_group_id, mediaGroup, ...mediaRest } = m;
            return {
                ...mediaRest,
                media_group: mediaGroup ? {
                    id: mediaGroup.id,
                    product_id: mediaGroup.product_id,
                    groupValues: mediaGroup.groupValues,
                    created_at: mediaGroup.created_at,
                    updated_at: mediaGroup.updated_at,
                } : null,
            };
        }) || [];

        return {
            ...rest,
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
        const product = await this.findOne(id);

        try {
            // 1. Update basic product information
            const basicInfoFields = ['name_en', 'name_ar', 'sku', 'short_description_en', 'short_description_ar', 'long_description_en', 'long_description_ar', 'category_id', 'vendor_id', 'is_active'];
            const basicInfoChanges: any = {};
            
            basicInfoFields.forEach(field => {
                if (dto[field] !== undefined) {
                    basicInfoChanges[field] = dto[field];
                }
            });

            if (Object.keys(basicInfoChanges).length > 0) {
                Object.assign(product, basicInfoChanges);
                await this.productsRepository.save(product);
            }

            // 2. Handle media - sync media IDs (add new, remove missing)
            if (dto.media !== undefined) {
                await this.mediaGroupService.syncProductMedia(id, dto.media || []);
            }

            // 3. Handle attributes - REPLACE all existing with new ones
            // First, delete all existing variants (which depend on attributes)
            await this.variantsService.deleteAllVariantsForProduct(id);
            
            // Delete all existing attributes
            await this.variantsService.deleteAllAttributesForProduct(id);
            
            // Add new attributes if provided
            if (dto.attributes && dto.attributes.length > 0) {
                await this.variantsService.addProductAttributes(id, dto.attributes);
            }

            // 4. Handle prices - REPLACE all existing with new ones
            await this.priceGroupService.deletePriceGroupsForProduct(id);
            
            if (dto.prices && dto.prices.length > 0) {
                for (const priceItem of dto.prices) {
                    const hasCombination = priceItem.combination && Object.keys(priceItem.combination).length > 0;
                    
                    if (hasCombination) {
                        await this.priceGroupService.findOrCreatePriceGroup(
                            id,
                            priceItem.combination!,
                            {
                                cost: priceItem.cost,
                                price: priceItem.price,
                                sale_price: priceItem.sale_price,
                            },
                        );
                    } else {
                        await this.priceGroupService.createSimplePriceGroup(
                            id,
                            {
                                cost: priceItem.cost,
                                price: priceItem.price,
                                sale_price: priceItem.sale_price,
                            },
                        );
                    }
                }
            }

            // 5. Handle weights - REPLACE all existing with new ones
            await this.weightGroupService.deleteWeightGroupsForProduct(id);
            
            if (dto.weights && dto.weights.length > 0) {
                for (const weightItem of dto.weights) {
                    const hasCombination = weightItem.combination && Object.keys(weightItem.combination).length > 0;
                    
                    if (hasCombination) {
                        await this.weightGroupService.findOrCreateWeightGroup(
                            id,
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
                            id,
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

            // 6. Handle stocks - REPLACE all existing with new ones
            await this.variantsService.deleteAllStocksForProduct(id);
            
            if (dto.stocks && dto.stocks.length > 0) {
                for (const stockItem of dto.stocks) {
                    const hasCombination = stockItem.combination && Object.keys(stockItem.combination).length > 0;
                    
                    if (hasCombination) {
                        await this.variantsService.setStockByCombination(id, stockItem.combination!, stockItem.quantity);
                    } else {
                        await this.variantsService.setSimpleStock(id, stockItem.quantity);
                    }
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
