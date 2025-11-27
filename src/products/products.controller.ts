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
import { ProductMediaGroupService } from './product-media-group.service';
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
        private readonly mediaGroupService: ProductMediaGroupService,
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

    /**
     * Upload media for a product
     * 
     * Form Data:
     * - file: The image/video file (required)
     * - variant_id: Optional - if provided, media is assigned to the media group
     *               based on that variant's media-controlling attribute values
     * - is_primary: Optional - set as primary image (default: false)
     * - sort_order: Optional - display order (default: 0)
     * 
     * How it works:
     * 1. If variant_id is provided, we look up the variant's attribute values
     * 2. We extract only values from attributes that control_media
     * 3. We find or create a media group for that combination
     * 4. The image is added to that group
     * 
     * Examples:
     * - General product media: { file, is_primary: true }
     * - Variant media: { file, variant_id: 5, is_primary: true }
     */
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
    async uploadMedia(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const isPrimary = req.body.is_primary === 'true' || req.body.is_primary === true;
        const sortOrder = req.body.sort_order ? parseInt(req.body.sort_order) : 0;
        const mediaUrl = `http://localhost:3001/uploads/products/${file.filename}`;

        const variantIdStr = req.body.variant_id;
        
        let mediaGroup;
        if (variantIdStr) {
            // Get or create media group based on variant's media-controlling attributes
            const variantId = parseInt(variantIdStr);
            if (isNaN(variantId)) {
                throw new BadRequestException('variant_id must be a valid number');
            }
            mediaGroup = await this.mediaGroupService.getOrCreateMediaGroupForVariant(variantId);
        } else {
            // General product media - simple group with no attribute values
            mediaGroup = await this.mediaGroupService.createSimpleMediaGroup(+id);
        }

        // Add media to the group
        return this.mediaGroupService.addMediaToGroup(
            +id,
            mediaGroup.id,
            mediaUrl,
            MediaType.IMAGE,
            sortOrder,
            isPrimary,
        );
    }
}