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
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';
import { RestoreCategoryDto, PermanentDeleteCategoryDto } from './dto/archive-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { AssignProductsToCategoryDto } from './dto/assign-products.dto';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { imageFileFilter, UPLOAD_FOLDERS } from '../common/utils/file-upload.util';

@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) { }

    // Admin only routes
    @Post()
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    @UseInterceptors(
        FileInterceptor('image', {
            storage: diskStorage({
                destination: UPLOAD_FOLDERS.CATEGORIES,
                filename: (req, file, cb) => {
                    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
            fileFilter: imageFileFilter,
            limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
        })
    )
    create(
        @Body() createCategoryDto: CreateCategoryDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        if (file) {
            createCategoryDto.image = `${req.protocol}://${req.get('host')}/uploads/categories/${file.filename}`;
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
            storage: diskStorage({
                destination: UPLOAD_FOLDERS.CATEGORIES,
                filename: (req, file, cb) => {
                    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
                    cb(null, uniqueName);
                },
            }),
            fileFilter: imageFileFilter,
            limits: { fileSize: 50 * 1024 * 1024 },
        })
    )
    update(
        @Param('id') id: number,
        @Body() updateCategoryDto: UpdateCategoryDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        if (file) {
            updateCategoryDto.image = `${req.protocol}://${req.get('host')}/uploads/categories/${file.filename}`;
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
    permanentDelete(@Param('id') id: number, @Body() options?: PermanentDeleteCategoryDto) {
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
    assignProducts(@Param('id') id: number, @Body() dto: AssignProductsToCategoryDto) {
        return this.categoriesService.assignProducts(id, dto.product_ids);
    }

    // Remove products from this category
    @Delete(':id/products')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    removeProducts(@Param('id') id: number, @Body() dto: AssignProductsToCategoryDto) {
        return this.categoriesService.removeProducts(id, dto.product_ids);
    }

    // Get products in this category
    @Get(':id/products')
    getProducts(@Param('id') id: number) {
        return this.categoriesService.getProducts(id);
    }
}