import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SpecificationsService } from './specifications.service';
import { CreateSpecificationDto } from './dto/create-specification.dto';
import { UpdateSpecificationDto } from './dto/update-specification.dto';
import { ReorderSpecificationsDto } from './dto/reorder-specifications.dto';
import { ReorderSpecificationValuesDto } from './dto/reorder-specification-values.dto';
import { UpdateSpecificationValueDto } from './dto/update-specification-value.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';

@Controller('specifications')
export class SpecificationsController {
  constructor(private readonly specificationsService: SpecificationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  create(@Body() createSpecificationDto: CreateSpecificationDto) {
    return this.specificationsService.create(createSpecificationDto);
  }

  @Get()
  findAll() {
    return this.specificationsService.findAll();
  }

  @Put('reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  reorderSpecifications(@Body() reorderDto: ReorderSpecificationsDto) {
    return this.specificationsService.reorderSpecifications(reorderDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.specificationsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  update(
    @Param('id') id: string,
    @Body() updateSpecificationDto: UpdateSpecificationDto,
  ) {
    return this.specificationsService.update(+id, updateSpecificationDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.specificationsService.remove(+id);
  }

  @Post(':id/values')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  addValue(
    @Param('id') id: string,
    @Body()
    body: { value_en: string; value_ar: string; parent_value_id?: number },
  ) {
    return this.specificationsService.addValue(
      +id,
      body.value_en,
      body.value_ar,
      body.parent_value_id,
    );
  }

  @Put(':id/values/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  reorderSpecificationValues(
    @Param('id') id: string,
    @Body() reorderDto: ReorderSpecificationValuesDto,
  ) {
    return this.specificationsService.reorderSpecificationValues(+id, reorderDto);
  }

  @Patch('values/:valueId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CATALOG_MANAGER)
  updateValue(
    @Param('valueId') valueId: string,
    @Body() updateDto: UpdateSpecificationValueDto,
  ) {
    return this.specificationsService.updateValue(+valueId, updateDto);
  }

  @Delete('values/:valueId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeValue(@Param('valueId') valueId: string) {
    return this.specificationsService.removeValue(+valueId);
  }
}
