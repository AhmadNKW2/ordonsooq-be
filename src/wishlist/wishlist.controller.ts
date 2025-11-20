import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  getWishlist(@Request() req) {
    return this.wishlistService.getWishlist(req.user.id);
  }

  @Post()
  addItem(@Request() req, @Body() addToWishlistDto: AddToWishlistDto) {
    return this.wishlistService.addItem(req.user.id, addToWishlistDto);
  }

  @Delete(':productId')
  removeItem(@Request() req, @Param('productId') productId: string) {
    return this.wishlistService.removeItem(req.user.id, +productId);
  }

  @Delete()
  clearWishlist(@Request() req) {
    return this.wishlistService.clearWishlist(req.user.id);
  }
}
