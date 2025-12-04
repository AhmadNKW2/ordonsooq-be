import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Column,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('wishlists')
@Unique('uq_wishlists_user_product', ['user_id', 'product_id'])
@Index('idx_wishlists_user_id', ['user_id'])
@Index('idx_wishlists_product_id', ['product_id'])
export class Wishlist {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  product_id: number;

  @CreateDateColumn()
  created_at: Date;
}
