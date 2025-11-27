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
import { ProductWeightGroupValue } from './product-weight-group-value.entity';

/**
 * Groups weight/dimensions by controlling attribute values.
 * Each group represents a unique combination of attribute values
 * that control weight for a product.
 * 
 * For simple products: One group with no group values
 * For variant products: Multiple groups, each with attribute values that define the group
 */
@Entity('product_weight_groups')
@Index('idx_product_weight_groups_product_id', ['product_id'])
export class ProductWeightGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column('decimal', { precision: 10, scale: 2 })
  weight: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  length?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  width?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  height?: number;

  @OneToMany(() => ProductWeightGroupValue, (groupValue) => groupValue.weightGroup)
  groupValues: ProductWeightGroupValue[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
