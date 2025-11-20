import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

export enum RatingStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('ratings')
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
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  // Product being rated
  @ManyToOne(() => Product, (product) => product.ratings)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
