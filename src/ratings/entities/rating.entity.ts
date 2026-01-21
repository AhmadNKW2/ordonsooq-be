import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

export enum RatingStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('ratings')
@Unique('uq_user_product_rating', ['userId', 'product_id'])
@Index('idx_ratings_product_id', ['product_id'])
@Index('idx_ratings_user_id', ['userId'])
@Index('idx_ratings_status', ['status'])
@Index('idx_ratings_product_status', ['product_id', 'status'])
export class Rating {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column('int')
  rating: number; // 1-5

  @Column('text', { nullable: true })
  comment: string;

  @Column({
    type: 'enum',
    enum: RatingStatus,
    default: RatingStatus.PENDING,
  })
  status: RatingStatus;

  @Column({ nullable: true })
  rejectionReason: string;

  // User who created the rating
  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  // Product being rated
  @ManyToOne(() => Product, (product) => product.ratings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  product_id: number;

  @ManyToOne(() => Vendor, (vendor) => vendor.comments, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @Column({ nullable: true })
  vendor_id: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
