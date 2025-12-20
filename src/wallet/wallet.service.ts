import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import {
  WalletTransaction,
  TransactionType,
  TransactionSource,
} from './entities/wallet-transaction.entity';
import { AddFundsDto } from './dto/add-funds.dto';
import { FilterTransactionDto } from './dto/filter-transaction.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private transactionRepository: Repository<WalletTransaction>,
    private dataSource: DataSource,
  ) {}

  async getOrCreateWallet(userId: number): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({
      where: { userId },
    });

    if (!wallet) {
      wallet = this.walletRepository.create({
        userId,
        balance: 0,
        totalCashback: 0,
      });
      wallet = await this.walletRepository.save(wallet);
    }

    return wallet;
  }

  async getWallet(userId: number) {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      data: wallet,
      message: 'Wallet retrieved successfully',
    };
  }

  async addFunds(userId: number, addFundsDto: AddFundsDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const newBalance = Number(wallet.balance) + Number(addFundsDto.amount);
      wallet.balance = newBalance;

      if (addFundsDto.source === TransactionSource.CASHBACK) {
        wallet.totalCashback =
          Number(wallet.totalCashback) + Number(addFundsDto.amount);
      }

      await queryRunner.manager.save(wallet);

      const transaction = queryRunner.manager.create(WalletTransaction, {
        walletId: wallet.id,
        type: TransactionType.CREDIT,
        source: addFundsDto.source,
        amount: addFundsDto.amount,
        balanceAfter: newBalance,
        description: addFundsDto.description,
        referenceId: addFundsDto.referenceId,
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      return {
        data: { wallet, transaction },
        message: 'Funds added successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deductFunds(
    userId: number,
    amount: number,
    source: TransactionSource,
    description?: string,
    referenceId?: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (Number(wallet.balance) < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const newBalance = Number(wallet.balance) - amount;
      wallet.balance = newBalance;
      await queryRunner.manager.save(wallet);

      const transaction = queryRunner.manager.create(WalletTransaction, {
        walletId: wallet.id,
        type: TransactionType.DEBIT,
        source,
        amount,
        balanceAfter: newBalance,
        description,
        referenceId,
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      return {
        data: { wallet, transaction },
        message: 'Funds deducted successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactions(userId: number, filterDto: FilterTransactionDto) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      type,
      source,
      minAmount,
      maxAmount,
    } = filterDto;

    const wallet = await this.getOrCreateWallet(userId);

    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.walletId = :walletId', { walletId: wallet.id });

    if (type) {
      queryBuilder.andWhere('transaction.type = :type', { type });
    }

    if (source) {
      queryBuilder.andWhere('transaction.source = :source', { source });
    }

    if (minAmount !== undefined) {
      queryBuilder.andWhere('transaction.amount >= :minAmount', { minAmount });
    }

    if (maxAmount !== undefined) {
      queryBuilder.andWhere('transaction.amount <= :maxAmount', { maxAmount });
    }

    queryBuilder
      .orderBy(`transaction.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      message: 'Transactions retrieved successfully',
    };
  }
  async calculateCashback(
    orderAmount: number,
    cashbackPercentage: number = 2,
  ): Promise<number> {
    return (orderAmount * cashbackPercentage) / 100;
  }

  async applyCashback(userId: number, orderAmount: number, orderId: string) {
    const cashbackAmount = await this.calculateCashback(orderAmount);

    return await this.addFunds(userId, {
      amount: cashbackAmount,
      source: TransactionSource.CASHBACK,
      description: `Cashback for order #${orderId}`,
      referenceId: orderId,
    });
  }
}
