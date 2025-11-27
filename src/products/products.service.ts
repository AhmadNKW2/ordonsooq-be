import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, PricingType } from './entities/product.entity';
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
                pricing_type: dto.pricing_type,
                category_id: dto.category_id,
                vendor_id: dto.vendor_id,
                is_active: dto.is_active ?? true,
            });
            const savedProduct = await this.productsRepository.save(product);

            // 2. Handle based on pricing type
            if (dto.pricing_type === PricingType.SINGLE) {
                // Simple product - set single pricing, weight, stock
                if (dto.single_pricing) {
                    await this.priceGroupService.createSimplePriceGroup(
                        savedProduct.id,
                        {
                            cost: dto.single_pricing.cost,
                            price: dto.single_pricing.price,
                            sale_price: dto.single_pricing.sale_price,
                        },
                    );
                }

                if (dto.product_weight) {
                    await this.weightGroupService.createSimpleWeightGroup(
                        savedProduct.id,
                        {
                            weight: dto.product_weight.weight,
                            length: dto.product_weight.length,
                            width: dto.product_weight.width,
                            height: dto.product_weight.height,
                        },
                    );
                }

                if (dto.stock_quantity !== undefined) {
                    await this.variantsService.setSimpleStock(savedProduct.id, dto.stock_quantity);
                }
            } else {
                // Variant product
                // 2a. Add attributes
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

                // 2b. Handle price groups
                if (dto.price_groups && dto.price_groups.length > 0) {
                    for (const pg of dto.price_groups) {
                        await this.priceGroupService.findOrCreatePriceGroup(
                            savedProduct.id,
                            pg.combination,
                            {
                                cost: pg.cost,
                                price: pg.price,
                                sale_price: pg.sale_price,
                            },
                        );
                    }
                }

                // 2c. Handle weight groups
                if (dto.weight_groups && dto.weight_groups.length > 0) {
                    for (const wg of dto.weight_groups) {
                        await this.weightGroupService.findOrCreateWeightGroup(
                            savedProduct.id,
                            wg.combination,
                            {
                                weight: wg.weight,
                                length: wg.length,
                                width: wg.width,
                                height: wg.height,
                            },
                        );
                    }
                }

                // 2d. Create variants with their stock
                if (dto.variants && dto.variants.length > 0) {
                    for (const variantData of dto.variants) {
                        // Create the variant
                        const variant = await this.variantsService.createVariant(
                            savedProduct.id,
                            variantData.attribute_value_ids,
                            variantData.sku_suffix,
                        );

                        // Set variant stock (stock is always per-variant)
                        if (variantData.stock_quantity !== undefined) {
                            await this.variantsService.setVariantStock(
                                savedProduct.id,
                                variant.id,
                                variantData.stock_quantity,
                            );
                        }
                    }
                }

                // 2e. Or auto-generate all variants
                if (dto.auto_generate_variants) {
                    await this.variantsService.generateAllVariants(savedProduct.id);
                }
            }

            // Return the complete product
            const result = await this.findOne(savedProduct.id);
            return {
                product: result,
                message: dto.pricing_type === PricingType.VARIANT 
                    ? 'Product created successfully with variant configuration.'
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
            relationLoadStrategy: 'query',
            relations: [
                'category',
                'vendor',
                'media',
                'media.mediaGroup',
                'mediaGroups',
                'mediaGroups.groupValues',
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

        return product;
    }

    /**
     * Comprehensive update method for products
     */
    async update(id: number, dto: UpdateProductDto): Promise<any> {
        const product = await this.findOne(id);
        const updates: string[] = [];

        try {
            // 1. Update basic product information
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

                if (mediaOps.delete_media_ids && mediaOps.delete_media_ids.length > 0) {
                    for (const mediaId of mediaOps.delete_media_ids) {
                        await this.mediaGroupService.deleteMedia(mediaId);
                    }
                    updates.push(`Deleted ${mediaOps.delete_media_ids.length} media item(s)`);
                }
            }

            // 3. Attributes management
            if (dto.add_attributes && dto.add_attributes.length > 0) {
                await this.variantsService.addProductAttributes(id, dto.add_attributes);
                updates.push(`Added ${dto.add_attributes.length} attribute(s)`);
            }

            if (dto.update_attributes && dto.update_attributes.length > 0) {
                for (const attr of dto.update_attributes) {
                    await this.variantsService.updateProductAttributeByAttributeId(id, attr.attribute_id, {
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

            // 4. Simple pricing update
            if (dto.single_pricing && product.pricing_type === PricingType.SINGLE) {
                await this.priceGroupService.createSimplePriceGroup(
                    id,
                    {
                        cost: dto.single_pricing.cost,
                        price: dto.single_pricing.price,
                        sale_price: dto.single_pricing.sale_price,
                    },
                );
                updates.push('Single pricing updated');
            }

            // 5. Price groups update (using group-based approach)
            if (dto.price_groups && dto.price_groups.length > 0) {
                for (const pg of dto.price_groups) {
                    await this.priceGroupService.findOrCreatePriceGroup(
                        id,
                        pg.combination,
                        {
                            cost: pg.cost,
                            price: pg.price,
                            sale_price: pg.sale_price,
                        },
                    );
                }
                updates.push(`Updated ${dto.price_groups.length} price group(s)`);
            }

            // 6. Simple weight update
            if (dto.product_weight && product.pricing_type === PricingType.SINGLE) {
                const weight = dto.product_weight;
                if (weight.weight !== undefined) {
                    await this.weightGroupService.createSimpleWeightGroup(
                        id,
                        {
                            weight: weight.weight,
                            length: weight.length,
                            width: weight.width,
                            height: weight.height,
                        },
                    );
                    updates.push('Product weight updated');
                }
            }

            // 7. Weight groups update (using group-based approach)
            if (dto.weight_groups && dto.weight_groups.length > 0) {
                for (const wg of dto.weight_groups) {
                    await this.weightGroupService.findOrCreateWeightGroup(
                        id,
                        wg.combination,
                        {
                            weight: wg.weight,
                            length: wg.length,
                            width: wg.width,
                            height: wg.height,
                        },
                    );
                }
                updates.push(`Updated ${dto.weight_groups.length} weight group(s)`);
            }

            // 8. Simple stock update
            if (dto.stock_quantity !== undefined && product.pricing_type === PricingType.SINGLE) {
                await this.variantsService.setSimpleStock(id, dto.stock_quantity);
                updates.push('Stock updated');
            }

            // 9. Variant stock update
            if (dto.variant_stocks && dto.variant_stocks.length > 0) {
                for (const vs of dto.variant_stocks) {
                    await this.variantsService.setVariantStock(id, vs.variant_id, vs.quantity);
                }
                updates.push(`Updated ${dto.variant_stocks.length} variant stock(s)`);
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
