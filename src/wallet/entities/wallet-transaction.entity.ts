import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Wallet } from './wallet.entity';

export enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum TransactionSource {
  CASHBACK = 'cashback',
  REFUND = 'refund',
  PURCHASE = 'purchase',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
  WITHDRAWAL = 'withdrawal',
}

@Entity('wallet_transactions')
@Index('idx_wallet_transactions_wallet_id', ['walletId'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column()
  walletId: number;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionSource,
  })
  source: TransactionSource;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 10, scale: 2 })
  balanceAfter: number;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  referenceId: string; // Order ID, etc.

  @CreateDateColumn()
  createdAt: Date;
}
