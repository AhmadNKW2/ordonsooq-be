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
  Req,
  Put,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import {
  PermanentDeleteVendorDto,
  RestoreVendorDto,
} from './dto/archive-vendor.dto';
import { ReorderVendorsDto } from './dto/reorder-vendors.dto';
import { AssignProductsToVendorDto } from './dto/assign-products.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { imageFileFilter } from '../common/utils/file-upload.helper';
import { R2StorageService } from '../common/services/r2-storage.service';

@Controller('vendors')
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly r2StorageService: R2StorageService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    }),
  )
  async create(
    @Body() createVendorDto: CreateVendorDto,
    @UploadedFile() logo: Express.Multer.File,
    @Req() req: any,
  ) {
    let logoUrl: string | undefined;
    if (logo) {
      const uploadResult = await this.r2StorageService.uploadFile(
        logo,
        'vendors',
      );
      logoUrl = uploadResult.url;
    }
    return this.vendorsService.create(createVendorDto, logoUrl);
  }

  @Get()
  findAll() {
    return this.vendorsService.findAll();
  }

  @Get('archive/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  findArchived() {
    return this.vendorsService.findArchived();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(+id);
  }

  @Get('slug/:slug')
  findOneBySlug(@Param('slug') slug: string) {
    return this.vendorsService.findOneBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updateVendorDto: UpdateVendorDto,
    @UploadedFile() logo: Express.Multer.File,
    @Req() req: any,
  ) {
    let logoUrl: string | undefined;
    if (logo) {
      const uploadResult = await this.r2StorageService.uploadFile(
        logo,
        'vendors',
      );
      logoUrl = uploadResult.url;
    }
    return this.vendorsService.update(+id, updateVendorDto, logoUrl);
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  @Post(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  archive(@Param('id') id: string, @Req() req: any) {
    return this.vendorsService.archive(+id, req.user.id);
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  restore(@Param('id') id: string, @Body() restoreDto?: RestoreVendorDto) {
    return this.vendorsService.restore(+id, restoreDto);
  }

  @Delete(':id/permanent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  permanentDelete(
    @Param('id') id: string,
    @Body() options?: PermanentDeleteVendorDto,
  ) {
    return this.vendorsService.permanentDelete(+id, options);
  }

  @Put('reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  reorder(@Body() dto: ReorderVendorsDto) {
    return this.vendorsService.reorder(dto);
  }

  // ========== PRODUCT ASSIGNMENT ==========

  // Assign products to this vendor
  @Post(':id/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  assignProducts(
    @Param('id') id: string,
    @Body() dto: AssignProductsToVendorDto,
  ) {
    return this.vendorsService.assignProducts(+id, dto.product_ids);
  }

  // Remove products from this vendor
  @Delete(':id/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  removeProducts(
    @Param('id') id: string,
    @Body() dto: AssignProductsToVendorDto,
  ) {
    return this.vendorsService.removeProducts(+id, dto.product_ids);
  }

  // Get products for this vendor
  @Get(':id/products')
  getProducts(@Param('id') id: string) {
    return this.vendorsService.getProducts(+id);
  }
}
