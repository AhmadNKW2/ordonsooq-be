import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountriesWorldService } from './countries-world.service';
import { CountriesWorldController } from './countries-world.controller';
import { CountryWorld } from './entities/country-world.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CountryWorld])],
  controllers: [CountriesWorldController],
  providers: [CountriesWorldService],
  exports: [CountriesWorldService],
})
export class CountriesWorldModule {}
