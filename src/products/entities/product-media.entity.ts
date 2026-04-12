import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Media } from '../../media/entities/media.entity';
import { Product } from './product.entity';

@Entity('product_media')
@Unique('uq_product_media_product_media', ['product_id', 'media_id'])
@Index('idx_product_media_product_id', ['product_id'])
@Index('idx_product_media_media_id', ['media_id'])
@Index('idx_product_media_product_sort', ['product_id', 'sort_order'])
export class ProductMedia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  product_id: number;

  @ManyToOne(() => Product, (product) => product.productMedia, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'int' })
  media_id: number;

  @ManyToOne(() => Media, (media) => media.productMedia, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'media_id' })
  media: Media;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}