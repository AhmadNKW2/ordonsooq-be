import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Wishlist } from '../wishlist/entities/wishlist.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Wishlist, Product])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Export so other modules can use it
})
export class UsersModule {}
