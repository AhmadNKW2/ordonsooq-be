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
    Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { FilterBannerDto } from './dto/filter-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { imageFileFilter } from '../common/utils/file-upload.util';
import { R2StorageService } from '../common/services/r2-storage.service';

@Controller('banners')
export class BannersController {
    constructor(
        private readonly bannersService: BannersService,
        private readonly r2StorageService: R2StorageService,
    ) { }

    // ========== BANNER CRUD ==========

    @Post()
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    @UseInterceptors(
        FileInterceptor('image', {
            storage: memoryStorage(),
            fileFilter: imageFileFilter,
            limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
        })
    )
    async create(
        @Body() createBannerDto: CreateBannerDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        if (!file) {
            throw new BadRequestException('Image file is required');
        }
        const uploadResult = await this.r2StorageService.uploadFile(file, 'banners');
        return this.bannersService.create(createBannerDto, uploadResult.url);
    }

    @Get()
    findAll(@Query() filterDto: FilterBannerDto) {
        return this.bannersService.findAll(filterDto);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.bannersService.findOne(+id);
    }

    @Patch(':id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    @UseInterceptors(
        FileInterceptor('image', {
            storage: memoryStorage(),
            fileFilter: imageFileFilter,
            limits: { fileSize: 50 * 1024 * 1024 },
        })
    )
    async update(
        @Param('id') id: string,
        @Body() updateBannerDto: UpdateBannerDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
    ) {
        let imageUrl: string | undefined;
        if (file) {
            const uploadResult = await this.r2StorageService.uploadFile(file, 'banners');
            imageUrl = uploadResult.url;
        }
        return this.bannersService.update(+id, updateBannerDto, imageUrl);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    remove(@Param('id') id: string) {
        return this.bannersService.remove(+id);
    }

    // ========== REORDERING ==========

    @Post('reorder')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN)
    reorder(@Body() dto: ReorderBannersDto) {
        return this.bannersService.reorder(dto);
    }
}