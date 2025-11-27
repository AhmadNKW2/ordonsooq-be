import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { Attribute } from '../../attributes/entities/attribute.entity';

@Entity('product_attributes')
@Unique('uq_product_attribute', ['product_id', 'attribute_id'])
@Index('idx_product_attributes_product_id', ['product_id'])
@Index('idx_product_attributes_attribute_id', ['attribute_id'])
export class ProductAttribute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  attribute_id: number;

  @ManyToOne(() => Attribute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: Attribute;

  @Column({ default: false })
  controls_pricing: boolean;

  @Column({ default: false })
  controls_media: boolean;

  @Column({ default: false })
  controls_weight: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
