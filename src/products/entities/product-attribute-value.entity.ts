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
import { AttributeValue } from '../../attributes/entities/attribute-value.entity';

@Entity('product_attribute_values')
@Unique('uq_product_attr_value', ['product_id', 'attribute_value_id'])
@Index('idx_product_attr_vals_product_id', ['product_id'])
@Index('idx_product_attr_vals_attr_val_id', ['attribute_value_id'])
export class ProductAttributeValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  attribute_value_id: number;

  @ManyToOne(() => AttributeValue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_value_id' })
  attribute_value: AttributeValue;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
