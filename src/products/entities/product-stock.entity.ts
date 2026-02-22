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
import { ProductVariant } from './product-variant.entity';

/**
 * Unified stock table for both simple and variant products.
 *
 * For simple products: variant_id is NULL (single stock for the product)
 * For variant products: variant_id points to the specific variant
 */
@Entity('product_stock')
@Unique('uq_product_variant_stock', ['product_id', 'variant_id'])
@Index('idx_product_stock_product_id', ['product_id'])
@Index('idx_product_stock_variant_id', ['variant_id'])
@Index('idx_product_stock_quantity', ['quantity'])
@Index('idx_product_stock_low', ['quantity', 'low_stock_threshold'])
export class ProductStock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, (product) => product.stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  /**
   * NULL for simple products, references ProductVariant for variant products
   */
  @Column({ nullable: true })
  variant_id: number | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ default: 0 })
  quantity: number;

  @Column({ default: 0 })
  reserved_quantity: number;

  @Column({ default: 10 })
  low_stock_threshold: number;

  @Column({ default: true })
  is_out_of_stock: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
