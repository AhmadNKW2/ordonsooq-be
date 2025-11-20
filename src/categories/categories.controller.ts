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
    BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';
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
        @UploadedFile() file?: Express.Multer.File
    ) {
        if (file) {
            createCategoryDto.image = `/uploads/categories/${file.filename}`;
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
        @UploadedFile() file?: Express.Multer.File
    ) {
        if (file) {
            updateCategoryDto.image = `/uploads/categories/${file.filename}`;
        }
        return this.categoriesService.update(id, updateCategoryDto);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    remove(@Param('id') id: number) {
        return this.categoriesService.remove(id);
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

    @Get('main')
    findMainCategories() {
        return this.categoriesService.findMainCategories();
    }

    @Get(':id')
    findOne(@Param('id') id: number) {
        return this.categoriesService.findOne(id);
    }
}