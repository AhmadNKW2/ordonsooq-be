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
  Request,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingStatusDto } from './dto/update-rating-status.dto';
import { FilterRatingDto } from './dto/filter-rating.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createRatingDto: CreateRatingDto, @Request() req) {
    return this.ratingsService.create(createRatingDto, req.user.id);
  }

  // Filter ratings (Public)
  @Post('filter')
  filterRatings(@Body() filterDto: FilterRatingDto) {
    return this.ratingsService.findAll(filterDto);
  }

  @Get()
  findAll(@Query() filterDto: FilterRatingDto) {
    return this.ratingsService.findAll(filterDto);
  }

  @Get('product/:productId')
  getProductRatings(@Param('productId') productId: number) {
    return this.ratingsService.getProductRatings(productId);
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.ratingsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id') id: number,
    @Body() updateStatusDto: UpdateRatingStatusDto,
  ) {
    return this.ratingsService.updateStatus(id, updateStatusDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: number, @Request() req) {
    const isAdmin = req.user.role === 'admin';
    return this.ratingsService.delete(id, req.user.id, isAdmin);
  }
}
