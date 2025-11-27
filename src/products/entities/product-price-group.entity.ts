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
import { ProductPriceGroupValue } from './product-price-group-value.entity';

/**
 * Groups pricing by controlling attribute values.
 * Each group represents a unique combination of attribute values
 * that control pricing for a product.
 * 
 * For simple products: One group with no group values
 * For variant products: Multiple groups, each with attribute values that define the group
 */
@Entity('product_price_groups')
@Index('idx_product_price_groups_product_id', ['product_id'])
export class ProductPriceGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column('decimal', { precision: 10, scale: 2 })
  cost: number;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  sale_price?: number;

  @OneToMany(() => ProductPriceGroupValue, (groupValue) => groupValue.priceGroup)
  groupValues: ProductPriceGroupValue[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
