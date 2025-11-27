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
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WishlistItem } from './wishlist-item.entity';

@Entity('wishlists')
@Unique('uq_user_wishlist', ['userId'])
@Index('idx_wishlists_user_id', ['userId'])
export class Wishlist {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @OneToMany(() => WishlistItem, (item) => item.wishlist, { cascade: true })
  items: WishlistItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
