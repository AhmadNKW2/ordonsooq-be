import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { Category } from '../categories/entities/category.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Banner } from '../banners/entities/banner.entity';
import { Brand } from '../brands/entities/brand.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Vendor, Banner, Brand])],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
