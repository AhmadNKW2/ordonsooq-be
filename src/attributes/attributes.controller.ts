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
import { AttributesService } from './attributes.service';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { ReorderAttributesDto } from './dto/reorder-attributes.dto';
import { ReorderAttributeValuesDto } from './dto/reorder-attribute-values.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';

@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createAttributeDto: CreateAttributeDto) {
    return this.attributesService.create(createAttributeDto);
  }

  @Get()
  findAll() {
    return this.attributesService.findAll();
  }

  @Put('reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reorderAttributes(@Body() reorderDto: ReorderAttributesDto) {
    return this.attributesService.reorderAttributes(reorderDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.attributesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateAttributeDto: UpdateAttributeDto) {
    return this.attributesService.update(+id, updateAttributeDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.attributesService.remove(+id);
  }

  @Post(':id/values')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  addValue(
    @Param('id') id: string,
    @Body() body: { value_en: string; value_ar: string },
  ) {
    return this.attributesService.addValue(+id, body.value_en, body.value_ar);
  }

  @Put(':id/values/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reorderAttributeValues(
    @Param('id') id: string,
    @Body() reorderDto: ReorderAttributeValuesDto,
  ) {
    return this.attributesService.reorderAttributeValues(+id, reorderDto);
  }

  @Delete('values/:valueId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeValue(@Param('valueId') valueId: string) {
    return this.attributesService.removeValue(+valueId);
  }
}
