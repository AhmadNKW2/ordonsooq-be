import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductMediaGroup } from './product-media-group.entity';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

/**
 * Media items linked to media groups.
 * 
 * For simple products: media_group_id points to a group with no group values
 * For variant products: media_group_id points to a group with attribute values that define the group
 */
@Entity('product_media')
@Index('idx_product_media_product_id', ['product_id'])
@Index('idx_product_media_group_id', ['media_group_id'])
export class ProductMedia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ nullable: true })
  media_group_id: number | null;

  @ManyToOne(() => ProductMediaGroup, (group) => group.media, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'media_group_id' })
  mediaGroup: ProductMediaGroup;

  @Column()
  url: string;

  @Column({
    type: 'enum',
    enum: MediaType,
    default: MediaType.IMAGE,
  })
  type: MediaType;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
