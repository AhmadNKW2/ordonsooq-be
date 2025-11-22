import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CountriesWorldService } from './countries-world.service';
import { CreateCountryWorldDto } from './dto/create-country-world.dto';
import { UpdateCountryWorldDto } from './dto/update-country-world.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';

@Controller('countries-world')
export class CountriesWorldController {
  constructor(private readonly countriesWorldService: CountriesWorldService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createCountryWorldDto: CreateCountryWorldDto) {
    return this.countriesWorldService.create(createCountryWorldDto);
  }

  @Get()
  findAll() {
    return this.countriesWorldService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.countriesWorldService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateCountryWorldDto: UpdateCountryWorldDto) {
    return this.countriesWorldService.update(+id, updateCountryWorldDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.countriesWorldService.remove(+id);
  }
}
