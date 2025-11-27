import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CouponType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

export enum CouponStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
}

@Entity('coupons')
@Index('idx_coupons_code', ['code'])
@Index('idx_coupons_status', ['status'])
export class Coupon {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true })
  code: string;

  @Column({
    type: 'enum',
    enum: CouponType,
  })
  type: CouponType;

  @Column('decimal', { precision: 10, scale: 2 })
  value: number; // Percentage (0-100) or fixed amount

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  minPurchaseAmount: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxDiscountAmount: number; // Max discount for percentage coupons

  @Column({ nullable: true })
  usageLimit: number; // Total usage limit

  @Column({ default: 0 })
  usageCount: number; // Current usage count

  @Column({ nullable: true })
  perUserLimit: number; // Usage limit per user

  @Column({ type: 'timestamp', nullable: true })
  validFrom: Date;

  @Column({ type: 'timestamp', nullable: true })
  validUntil: Date;

  @Column({
    type: 'enum',
    enum: CouponStatus,
    default: CouponStatus.ACTIVE,
  })
  status: CouponStatus;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
