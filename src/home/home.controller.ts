import { Controller, Get, Query } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeProductsQueryDto } from './dto/home-products-query.dto';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getHomeData() {
    return this.homeService.getHomeData();
  }

  @Get('products')
  getHomeProducts(@Query() query: HomeProductsQueryDto) {
    return this.homeService.getHomeProducts(query);
  }
}
