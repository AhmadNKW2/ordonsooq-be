import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductMediaGroupValue } from './product-media-group-value.entity';
import { Media } from '../../media/entities/media.entity';

/**
 * Groups media by controlling attribute values.
 * Each group represents a unique combination of attribute values
 * that control media for a product.
 * 
 * For simple products: One group with no group values
 * For variant products: Multiple groups, each with attribute values that define the group
 * 
 * Media files are linked to this group via media_group_id in media table
 */
@Entity('product_media_groups')
@Index('idx_product_media_groups_product_id', ['product_id'])
export class ProductMediaGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @OneToMany(() => ProductMediaGroupValue, (groupValue) => groupValue.mediaGroup, { cascade: true })
  groupValues: ProductMediaGroupValue[];

  // Media items in this group
  @OneToMany(() => Media, (media) => media.mediaGroup)
  media: Media[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
