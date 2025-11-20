import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ProductsService } from './products.service';
import { ProductMediaService } from './product-media.service';
import { MediaType } from './entities/product-media.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductDto } from './dto/filter-product.dto';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { mediaFileFilter, editFileName } from '../common/utils/file-upload.helper';

@Controller('products')
export class ProductsController {
    constructor(
        private readonly productsService: ProductsService,
        private readonly mediaService: ProductMediaService,
    ) { }

    // ========== PRODUCT CRUD ==========

    @Post()
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    create(@Body() createProductDto: CreateProductDto) {
        return this.productsService.create(createProductDto);
    }

    @Get()
    findAll(@Query() filterDto: FilterProductDto) {
        return this.productsService.findAll(filterDto);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.productsService.findOne(+id);
    }

    @Patch(':id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
        return this.productsService.update(+id, updateProductDto);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    remove(@Param('id') id: string) {
        return this.productsService.remove(+id);
    }

    // ========== MEDIA UPLOAD ==========

    @Post(':id/media')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads/products',
                filename: editFileName,
            }),
            fileFilter: mediaFileFilter,
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        }),
    )
    async uploadProductMedia(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const isPrimary = req.body.is_primary === 'true' || req.body.is_primary === true;
        const sortOrder = req.body.sort_order ? parseInt(req.body.sort_order) : undefined;

        const mediaUrl = `http://localhost:3001/uploads/products/${file.filename}`;

        return this.mediaService.addProductMedia(
            +id,
            mediaUrl,
            MediaType.IMAGE,
            sortOrder,
            isPrimary,
        );
    }

    @Post(':id/variant-media')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads/products',
                filename: editFileName,
            }),
            fileFilter: mediaFileFilter,
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        }),
    )
    async uploadVariantMedia(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const attributeValueId = req.body.attribute_value_id;
        if (!attributeValueId) {
            throw new BadRequestException('attribute_value_id is required for variant media');
        }

        const isPrimary = req.body.is_primary === 'true' || req.body.is_primary === true;
        const sortOrder = req.body.sort_order ? parseInt(req.body.sort_order) : undefined;

        const mediaUrl = `http://localhost:3001/uploads/products/${file.filename}`;

        return this.mediaService.addVariantMedia(
            +id,
            +attributeValueId,
            mediaUrl,
            MediaType.IMAGE,
            sortOrder,
            isPrimary,
        );
    }
}