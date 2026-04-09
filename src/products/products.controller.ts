import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  Patch,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { DeleteReviewProductsDto } from './dto/delete-review-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PatchProductDto } from './dto/patch-product.dto';
import { FilterProductDto, AssignProductsDto } from './dto/filter-product.dto';
import { SyncLinkedProductsDto } from './dto/sync-linked-products.dto';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RestoreProductDto } from './dto/restore-product.dto';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

class SetProductTagsDto {
  @IsArray()
  @IsString({ each: true })
  tags: string[];
}

class AddProductTagDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

const PRODUCTS_MANAGER_ROLES = [
  UserRole.ADMIN,
  UserRole.CATALOG_MANAGER,
  UserRole.CONSTANT_TOKEN_ADMIN,
] as const;

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ========== PRODUCT CRUD ==========

  /**
   * POST /products/reindex?rebuild=true
   * Rebuild the entire Typesense products index from the database.
   * Pass ?rebuild=true to drop+recreate the collection schema first (for schema changes).
   * Admin-only, safe to run multiple times.
   */
  @Post('reindex')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  reindexSearch(@Query('rebuild') rebuild?: string) {
    const jobId = this.productsService.startReindexJob({
      dropFirst: rebuild === 'true',
    });
    return {
      job_id: jobId,
      message:
        'Reindex started. Poll GET /products/jobs/:job_id to track progress.',
    };
  }

  /**
   * POST /products/reindex/:id
   * Reindex a single product by ID. Useful for debugging.
   */
  @Post('reindex/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  reindexOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.reindexOne(id);
  }

  /**
   * POST /products/generate-concepts
   * Trigger AI synonym concept generation for ALL products (all statuses).
   * Already-existing concept_keys are skipped — safe to re-run.
   * Admin-only. Returns 202 immediately; poll GET /products/jobs/:job_id for status.
   */
  @Post('generate-concepts')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  generateAiConcepts() {
    const jobId = this.productsService.startGenerateConceptsJob();
    return {
      job_id: jobId,
      message:
        'AI concept generation started. Poll GET /products/jobs/:job_id to track progress.',
    };
  }

  /**
   * GET /products/jobs/:jobId
   * Poll the status of a background reindex or generate-concepts job.
   * Returns status: 'running' | 'done' | 'failed', duration_seconds, and the final result.
   */
  @Get('jobs/:jobId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  getJobStatus(@Param('jobId') jobId: string) {
    const status = this.productsService.getJobStatus(jobId);
    if (!status)
      throw new NotFoundException(
        `Job '${jobId}' not found (may have expired after 24 h)`,
      );
    return status;
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  @ApiOperation({ summary: 'Create a product' })
  @ApiBody({
    type: CreateProductDto,
    description: 'Full product payload having everything',
    examples: {
      default: {
        summary: 'Full payload example',
        value: {
          name_en: 'ASD Gaming Mouse',
          name_ar: 'ماوس ألعاب ASD',
          sku: 'ASD-MOUSE-001',
          record: 'MIGRATED_FROM_OLD_DB_123',
          status: 'active',
          short_description_en: '<p>Lightweight gaming mouse with configurable options.</p>',
          short_description_ar: '<p>ماوس ألعاب خفيف مع خيارات قابلة للتخصيص.</p>',
          long_description_en: '<p>Premium gaming mouse designed for precision, speed, and comfort.</p>',
          long_description_ar: '<p>ماوس ألعاب احترافي مصمم للدقة والسرعة والراحة.</p>',
          category_ids: [35],
          reference_link: 'https://mcc-jo.com/category/mouse',
          vendor_id: 2,
          brand_id: 34,
          visible: true,
          cost: 30,
          price: 50,
          sale_price: 45,
          weight: 0.25,
          length: 12,
          width: 6,
          height: 4,
          quantity: 100,
          low_stock_threshold: 10,
          is_out_of_stock: false,
          meta_title_en: 'ASD Gaming Mouse | Ordonsooq',
          meta_title_ar: 'ماوس ألعاب ASD | أوردون سوق',
          meta_description_en:
            'Shop the ASD gaming mouse with configurable variants and premium performance.',
          meta_description_ar:
            'تسوّق ماوس الألعاب ASD مع خيارات متعددة وأداء مميز.',
          specifications: [
            {
              specification_id: 11,
              specification_value_ids: [65, 64],
            },
            {
              specification_id: 1,
              specification_value_ids: [57],
            },
          ],
          attributes: [
            {
              attribute_id: 3,
              attribute_value_ids: [6, 7],
            },
            {
              attribute_id: 10,
              attribute_value_ids: [29],
            },
            {
              attribute_id: 11,
              attribute_value_ids: [30],
            },
            {
              attribute_id: 12,
              attribute_value_ids: [40],
            },
          ],
          media: [
            {
              media_id: 3172,
              is_primary: true,
              sort_order: 0,
            },
            {
              media_id: 3173,
              is_primary: false,
              sort_order: 1,
            },
          ],
          linked_product_ids: [41, 42],
          tags: ['gaming', 'mouse', 'rgb'],
        }
      }
    },
  })
  create(@Body() createProductDto: CreateProductDto, @Req() req: any) {
    return this.productsService.create(createProductDto, req.user?.id);
  }

  @Put('linked-products')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  @ApiOperation({ summary: 'Sync a linked products group' })
  syncLinkedProducts(@Body() dto: SyncLinkedProductsDto) {
    return this.productsService.syncProductsGroup(dto.product_ids);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiQuery({
    name: 'vendor_id',
    required: false,
    type: Number,
    description: 'Alias for vendorId',
  })
  findAll(@Query() filterDto: FilterProductDto, @Req() req: any) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER ||
      req.user?.role === UserRole.CONSTANT_TOKEN_ADMIN ||
      req.user?.role === 'products_api';
    return this.productsService.findAll(filterDto, isAdmin);
  }

  @Get('vendor/:vendorId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get products by vendor' })
  findAllByVendor(
    @Param('vendorId', ParseIntPipe) vendorId: number,
    @Query() filterDto: FilterProductDto,
    @Req() req: any,
  ) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER ||
      req.user?.role === UserRole.CONSTANT_TOKEN_ADMIN ||
      req.user?.role === 'products_api';

    return this.productsService.findAll(
      {
        ...filterDto,
        vendorId,
        vendor_ids: undefined,
      },
      isAdmin,
    );
  }

  @Get('reference-link')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get a product by reference link' })
  @ApiQuery({
    name: 'reference_link',
    required: true,
    example: 'https://example.com/products/lg-ultragear-39gx90sa',
  })
  findOneByReferenceLink(
    @Query('reference_link') referenceLink: string,
    @Req() req: any,
  ) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER ||
      req.user?.role === UserRole.CONSTANT_TOKEN_ADMIN ||
      req.user?.role === 'products_api';
    return this.productsService.findOneByReferenceLink(referenceLink, isAdmin);
  }

  @Get('slug-redirect/:slug')
  @HttpCode(HttpStatus.OK)
  async getSlugRedirect(@Param('slug') slug: string) {
    const redirect = await this.productsService.findSlugRedirect(slug);
    if (!redirect) {
      throw new NotFoundException('No redirect found for this slug');
    }
    return { new_slug: redirect.new_slug };
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER ||
      req.user?.role === UserRole.CONSTANT_TOKEN_ADMIN ||
      req.user?.role === 'products_api';
    return this.productsService.findOne(id, isAdmin);
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  findOneBySlug(@Param('slug') slug: string, @Req() req: any) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER ||
      req.user?.role === UserRole.CONSTANT_TOKEN_ADMIN ||
      req.user?.role === 'products_api';
    return this.productsService.findOneBySlug(slug, isAdmin);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  @ApiOperation({ summary: 'Replace a product' })
  @ApiBody({
    type: UpdateProductDto,
    examples: {
      replace_specifications: {
        summary: 'Replace product fields including specifications',
        value: {
          name_en: 'LG UltraGear WOLED Gaming Monitor 39-inch',
          name_ar: 'LG UltraGear WOLED Gaming Monitor 39-inch',
          short_description_en: 'Gaming monitor with OLED panel',
          short_description_ar: 'Gaming monitor with OLED panel',
          long_description_en: 'Detailed product description',
          long_description_ar: 'Detailed product description',
          category_ids: [9],
          reference_link: 'https://mcc-jo.com/category/monitors',
          vendor_id: 2,
          brand_id: 34,
          visible: true,
          cost: 1200,
          price: 1585.9,
          sale_price: 1499.9,
          weight: 10.5,
          length: 93.5,
          width: 28.4,
          height: 61.2,
          quantity: 8,
          low_stock_threshold: 3,
          is_out_of_stock: false,
          meta_title_en: 'LG UltraGear WOLED Gaming Monitor 39-inch | Ordonsooq',
          meta_title_ar: 'شاشة LG UltraGear WOLED مقاس 39 بوصة | أوردون سوق',
          meta_description_en:
            'Buy the LG UltraGear 39-inch WOLED gaming monitor with premium display performance.',
          meta_description_ar:
            'اشترِ شاشة LG UltraGear WOLED مقاس 39 بوصة بأداء عرض مميز للألعاب.',
          media: [
            { media_id: 3172, is_primary: true, sort_order: 0 },
            { media_id: 3173, is_primary: false, sort_order: 1 },
          ],
          specifications: [
            { specification_id: 1, specification_value_ids: [60] },
            { specification_id: 4, specification_value_ids: [7, 39] },
            { specification_id: 8, specification_value_ids: [50] },
            { specification_id: 9, specification_value_ids: [49] },
            { specification_id: 10, specification_value_ids: [35] },
            { specification_id: 11, specification_value_ids: [67] },
          ],
          linked_product_ids: [50, 51],
          tags: ['monitor', 'oled', 'gaming'],
        },
      },
      replace_attributes_and_specifications: {
        summary: 'Replace attributes and specifications together',
        value: {
          name_en: 'Gaming Mouse Pro',
          name_ar: 'Gaming Mouse Pro',
          short_description_en: 'Wireless gaming mouse',
          short_description_ar: 'Wireless gaming mouse',
          long_description_en: 'Detailed gaming mouse description',
          long_description_ar: 'Detailed gaming mouse description',
          category_ids: [9],
          reference_link: 'https://mcc-jo.com/category/gaming-mice',
          vendor_id: 2,
          brand_id: 34,
          visible: true,
          cost: 70,
          price: 129.9,
          sale_price: 119.9,
          weight: 0.12,
          length: 12,
          width: 6.5,
          height: 4,
          quantity: 45,
          low_stock_threshold: 5,
          is_out_of_stock: false,
          meta_title_en: 'Gaming Mouse Pro | Ordonsooq',
          meta_title_ar: 'ماوس الألعاب برو | أوردون سوق',
          meta_description_en:
            'Upgrade to the Gaming Mouse Pro with refined specs and accessory options.',
          meta_description_ar:
            'طوّر تجربتك مع Gaming Mouse Pro بمواصفات محسّنة وخيارات إضافية.',
          attributes: [
            {
              attribute_id: 21,
              attribute_value_ids: [101, 102],
            },
          ],
          media: [
            { media_id: 4101, is_primary: true, sort_order: 0 },
            { media_id: 4102, is_primary: false, sort_order: 1 },
          ],
          specifications: [
            { specification_id: 4, specification_value_ids: [39] },
            { specification_id: 11, specification_value_ids: [67] },
          ],
          linked_product_ids: [12, 18, 27],
          tags: ['gaming', 'mouse', 'wireless'],
        },
      },
    },
  })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(+id, updateProductDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  @ApiOperation({ summary: 'Partially update a product' })
  @ApiBody({
    type: PatchProductDto,
    examples: {
      only_specifications: {
        summary: 'Update only product specifications',
        value: {
          specifications: [
            { specification_id: 1, specification_value_ids: [60] },
            { specification_id: 4, specification_value_ids: [7, 8, 39] },
            { specification_id: 8, specification_value_ids: [50] },
            { specification_id: 9, specification_value_ids: [49] },
            { specification_id: 10, specification_value_ids: [35] },
            { specification_id: 11, specification_value_ids: [67] },
          ],
        },
      },
      attributes_and_specifications: {
        summary: 'Update attributes and specifications together',
        value: {
          reference_link: 'https://mcc-jo.com/category/gaming-mice',
          attributes: [
            {
              attribute_id: 21,
              attribute_value_ids: [101, 102],
            },
          ],
          specifications: [
            { specification_id: 4, specification_value_ids: [39] },
            { specification_id: 11, specification_value_ids: [67] },
          ],
          media: [
            { media_id: 4101, is_primary: true, sort_order: 0 },
            { media_id: 4102, is_primary: false, sort_order: 1 },
          ],
          price: 129.9,
          sale_price: 119.9,
          quantity: 45,
          weight: 0.12,
          length: 12,
          width: 6.5,
          height: 4,
          is_out_of_stock: false,
          linked_product_ids: [12, 18, 27],
          tags: ['gaming', 'mouse', 'wireless'],
        },
      },
      clear_specifications: {
        summary: 'Remove all product specifications',
        value: {
          specifications: [],
        },
      },
      seo_only: {
        summary: 'Update only SEO fields',
        value: {
          meta_title_en: 'Wireless Headphones | Ordonsooq',
          meta_title_ar: 'سماعات لاسلكية | أوردون سوق',
          meta_description_en:
            'Buy the best wireless headphones with ANC technology.',
          meta_description_ar:
            'اشترِ أفضل السماعات اللاسلكية بتقنية إلغاء الضوضاء.',
        },
      },
    },
  })
  patch(@Param('id') id: string, @Body() patchProductDto: PatchProductDto) {
    return this.productsService.update(
      +id,
      patchProductDto as UpdateProductDto,
    );
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  @Post(':id/archive')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  archive(@Param('id') id: string, @Req() req: any) {
    return this.productsService.archive(+id, req.user.id);
  }

  @Post(':id/restore')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  restore(@Param('id') id: string, @Body() dto: RestoreProductDto) {
    return this.productsService.restore(+id, dto.newCategoryId);
  }

  @Get('archive/list')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  findArchived(@Query() filterDto: FilterProductDto) {
    return this.productsService.findArchived(filterDto);
  }

  @Delete('review/permanent')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Permanently delete review products by category and vendor',
  })
  @ApiBody({
    type: DeleteReviewProductsDto,
    description:
      'Deletes every product whose status is review and matches both the given category and vendor.',
    examples: {
      default: {
        summary: 'Delete review products for one vendor/category pair',
        value: {
          category_id: 35,
          vendor_id: 2,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Review products permanently deleted',
    schema: {
      example: {
        message: 'Deleted 4 review products for vendor "Tech Vendor" in category "Gaming"',
        deleted: 4,
        filters: {
          status: 'review',
          category_id: 35,
          vendor_id: 2,
        },
      },
    },
  })
  permanentDeleteReviewProducts(@Body() dto: DeleteReviewProductsDto) {
    return this.productsService.permanentDeleteReviewProducts(
      dto.category_id,
      dto.vendor_id,
    );
  }

  @Delete(':id/permanent')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  permanentDelete(@Param('id') id: string) {
    return this.productsService.permanentDelete(+id);
  }

  // ========== BULK ASSIGNMENT ==========

  @Post('assign/category/:categoryId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  assignToCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: AssignProductsDto,
  ) {
    return this.productsService.assignProductsToCategory(
      +categoryId,
      dto.product_ids,
    );
  }

  @Delete('assign/category/:categoryId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  removeFromCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: AssignProductsDto,
  ) {
    return this.productsService.removeProductsFromCategory(
      +categoryId,
      dto.product_ids,
    );
  }

  @Post('assign/vendor/:vendorId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  assignToVendor(
    @Param('vendorId') vendorId: string,
    @Body() dto: AssignProductsDto,
  ) {
    return this.productsService.assignProductsToVendor(
      +vendorId,
      dto.product_ids,
    );
  }

  @Delete('assign/vendor/:vendorId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  removeFromVendor(
    @Param('vendorId') vendorId: string,
    @Body() dto: AssignProductsDto,
  ) {
    return this.productsService.removeProductsFromVendor(
      +vendorId,
      dto.product_ids,
    );
  }

  // ========== PRODUCT TAG MANAGEMENT ==========

  /**
   * GET /products/:id/tags
   * Returns all tags attached to the product with their linked concepts.
   */
  @Get(':id/tags')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  getProductTags(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.getProductTags(id);
  }

  /**
   * PUT /products/:id/tags
   * Replaces the full tag list for a product.
   * Pass tags: [] to clear all tags.
   * Each name is normalised and created if it does not exist yet.
   */
  @Put(':id/tags')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  setProductTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetProductTagsDto,
  ) {
    return this.productsService.syncProductTags(id, dto.tags);
  }

  /**
   * POST /products/:id/tags
   * Adds a single tag (by name) to the product.
   * Creates the tag + fires AI concept generation if brand-new.
   */
  @Post(':id/tags')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  addProductTag(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddProductTagDto,
  ) {
    return this.productsService.addProductTagByName(id, dto.name);
  }

  /**
   * DELETE /products/:id/tags/:tagId
   * Removes a single tag (by its numeric ID) from the product.
   */
  @Delete(':id/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...PRODUCTS_MANAGER_ROLES)
  removeProductTag(
    @Param('id', ParseIntPipe) id: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ) {
    return this.productsService.removeProductTag(id, tagId);
  }
}
