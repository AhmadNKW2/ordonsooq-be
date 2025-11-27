import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WalletTransaction } from './wallet-transaction.entity';

@Entity('wallets')
@Index('idx_wallets_user_id', ['userId'])
export class Wallet {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  userId: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  balance: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  totalCashback: number;

  @OneToMany(() => WalletTransaction, (transaction) => transaction.wallet)
  transactions: WalletTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
