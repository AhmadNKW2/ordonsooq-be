import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CashbackType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

@Entity('cashback_rules')
@Index('idx_cashback_rules_is_active', ['isActive'])
export class CashbackRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: CashbackType,
    default: CashbackType.PERCENTAGE,
  })
  type: CashbackType;

  @Column('decimal', { precision: 10, scale: 2 })
  value: number; // Percentage (e.g., 2.0 for 2%) or Fixed Amount (e.g. 5.0)

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  minOrderAmount: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxCashbackAmount: number; // Cap per transaction (e.g., max 50 SAR cashback), null means unlimited

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
