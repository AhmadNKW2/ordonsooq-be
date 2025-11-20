import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { AddFundsDto } from './dto/add-funds.dto';
import { FilterTransactionDto } from './dto/filter-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, UserRole } from '../common/decorators/roles.decorator';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getWallet(@Request() req) {
    return this.walletService.getWallet(req.user.id);
  }

  // Filter transactions
  @Post('transactions/filter')
  filterTransactions(@Request() req, @Body() filterDto: FilterTransactionDto) {
    return this.walletService.getTransactions(req.user.id, filterDto);
  }

  @Get('transactions')
  getTransactions(@Request() req, @Query() filterDto: FilterTransactionDto) {
    return this.walletService.getTransactions(req.user.id, filterDto);
  }

  @Post('add-funds')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  addFunds(@Body() addFundsDto: AddFundsDto, @Request() req) {
    // This could be modified to get userId from body for admin operations
    return this.walletService.addFunds(req.user.id, addFundsDto);
  }
}
