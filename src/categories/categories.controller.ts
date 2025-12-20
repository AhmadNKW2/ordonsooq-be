import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
  Put,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';
import {
  RestoreCategoryDto,
  PermanentDeleteCategoryDto,
} from './dto/archive-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { AssignProductsToCategoryDto } from './dto/assign-products.dto';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { imageFileFilter } from '../common/utils/file-upload.util';
import { R2StorageService } from '../common/services/r2-storage.service';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly r2StorageService: R2StorageService,
  ) {}

  // Admin only routes
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (file) {
      const uploadResult = await this.r2StorageService.uploadFile(
        file,
        'categories',
      );
      createCategoryDto.image = uploadResult.url;
    }
    return this.categoriesService.create(createCategoryDto);
  }

  // Filter categories (Public)
  @Post('filter')
  filterCategories(@Body() filterDto: FilterCategoryDto) {
    return this.categoriesService.findAll(filterDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async update(
    @Param('id') id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (file) {
      const uploadResult = await this.r2StorageService.uploadFile(
        file,
        'categories',
      );
      updateCategoryDto.image = uploadResult.url;
    }
    return this.categoriesService.update(id, updateCategoryDto);
  }

  // Public routes
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get('tree')
  getCategoryTree() {
    return this.categoriesService.getCategoryTree();
  }

  // Get archived categories (trash view) - includes archived products and subcategories
  @Get('archive/list')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  findArchived(@Body() filterDto?: FilterCategoryDto) {
    return this.categoriesService.findArchived(filterDto);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.categoriesService.findOne(id);
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  // Archive a category (soft delete)
  @Post(':id/archive')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  archive(@Param('id') id: number, @Request() req) {
    return this.categoriesService.archive(id, req.user.id);
  }

  // Restore a category from archive
  @Post(':id/restore')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(@Param('id') id: number, @Body() restoreDto: RestoreCategoryDto) {
    return this.categoriesService.restore(id, restoreDto);
  }

  // Permanently delete a category (hard delete)
  @Delete(':id/permanent')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  permanentDelete(
    @Param('id') id: number,
    @Body() options?: PermanentDeleteCategoryDto,
  ) {
    return this.categoriesService.permanentDelete(id, options);
  }

  // Reorder categories
  @Put('reorder')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(dto.categories);
  }

  // ========== PRODUCT ASSIGNMENT ==========

  // Assign products to this category
  @Post(':id/products')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  assignProducts(
    @Param('id') id: number,
    @Body() dto: AssignProductsToCategoryDto,
  ) {
    return this.categoriesService.assignProducts(id, dto.product_ids);
  }

  // Remove products from this category
  @Delete(':id/products')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  removeProducts(
    @Param('id') id: number,
    @Body() dto: AssignProductsToCategoryDto,
  ) {
    return this.categoriesService.removeProducts(id, dto.product_ids);
  }

  // Get products in this category
  @Get(':id/products')
  getProducts(@Param('id') id: number) {
    return this.categoriesService.getProducts(id);
  }
}
