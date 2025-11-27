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
import { Wishlist } from './wishlist.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('wishlist_items')
@Unique('uq_wishlist_product', ['wishlistId', 'productId'])
@Index('idx_wishlist_items_wishlist_id', ['wishlistId'])
@Index('idx_wishlist_items_product_id', ['productId'])
export class WishlistItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => Wishlist, (wishlist) => wishlist.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wishlistId' })
  wishlist: Wishlist;

  @Column()
  wishlistId: number;

  @ManyToOne(() => Product, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: number;

  @CreateDateColumn()
  createdAt: Date;
}
