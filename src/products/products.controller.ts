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
import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PatchProductDto } from './dto/patch-product.dto';
import { FilterProductDto, AssignProductsDto } from './dto/filter-product.dto';
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  create(@Body() createProductDto: CreateProductDto, @Req() req: any) {
    return this.productsService.create(createProductDto, req.user?.id);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Query() filterDto: FilterProductDto, @Req() req: any) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER;
    return this.productsService.findAll(filterDto, isAdmin);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER;
    return this.productsService.findOne(id, isAdmin);
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  findOneBySlug(@Param('slug') slug: string, @Req() req: any) {
    const isAdmin =
      req.user?.role === UserRole.ADMIN ||
      req.user?.role === UserRole.CATALOG_MANAGER;
    return this.productsService.findOneBySlug(slug, isAdmin);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(+id, updateProductDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  patch(@Param('id') id: string, @Body() patchProductDto: PatchProductDto) {
    return this.productsService.update(
      +id,
      patchProductDto as UpdateProductDto,
    );
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  @Post(':id/archive')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  archive(@Param('id') id: string, @Req() req: any) {
    return this.productsService.archive(+id, req.user.id);
  }

  @Post(':id/restore')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  restore(@Param('id') id: string, @Body() dto: RestoreProductDto) {
    return this.productsService.restore(+id, dto.newCategoryId);
  }

  @Get('archive/list')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  findArchived(@Query() filterDto: FilterProductDto) {
    return this.productsService.findArchived(filterDto);
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  removeProductTag(
    @Param('id', ParseIntPipe) id: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ) {
    return this.productsService.removeProductTag(id, tagId);
  }
}
