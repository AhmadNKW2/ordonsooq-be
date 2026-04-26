import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpecificationsService } from './specifications.service';
import { SpecificationsController } from './specifications.controller';
import { Specification } from './entities/specification.entity';
import { SpecificationValue } from './entities/specification-value.entity';
import { Category } from '../categories/entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Specification, SpecificationValue, Category]),
  ],
  controllers: [SpecificationsController],
  providers: [SpecificationsService],
  exports: [SpecificationsService],
})
export class SpecificationsModule {}
