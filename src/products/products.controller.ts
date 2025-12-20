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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductDto, AssignProductsDto } from './dto/filter-product.dto';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RestoreProductDto } from './dto/restore-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(+id, updateProductDto);
  }

  // ========== LIFECYCLE MANAGEMENT ==========

  @Post(':id/archive')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  archive(@Param('id') id: string, @Req() req: any) {
    return this.productsService.archive(+id, req.user.id);
  }

  @Post(':id/restore')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(@Param('id') id: string, @Body() dto: RestoreProductDto) {
    return this.productsService.restore(+id, dto.newCategoryId);
  }

  @Get('archive/list')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
  removeFromVendor(
    @Param('vendorId') vendorId: string,
    @Body() dto: AssignProductsDto,
  ) {
    return this.productsService.removeProductsFromVendor(
      +vendorId,
      dto.product_ids,
    );
  }
}
