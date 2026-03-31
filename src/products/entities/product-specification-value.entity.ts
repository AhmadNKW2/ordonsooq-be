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
import { SpecificationValue } from '../../specifications/entities/specification-value.entity';

@Entity('product_specification_values')
@Unique('uq_product_spec_value', ['product_id', 'specification_value_id'])
@Index('idx_product_spec_vals_product_id', ['product_id'])
@Index('idx_product_spec_vals_spec_val_id', ['specification_value_id'])
export class ProductSpecificationValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  specification_value_id: number;

  @ManyToOne(() => SpecificationValue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'specification_value_id' })
  specification_value: SpecificationValue;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
