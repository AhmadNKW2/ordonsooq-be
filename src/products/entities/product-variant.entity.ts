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
import { ProductVariantCombination } from './product-variant-combination.entity';

/**
 * Represents a specific variant of a product.
 * A variant is a unique combination of attribute values (e.g., Red + Small).
 * 
 * Simple products don't have variants.
 * Variant products have one or more ProductVariant records.
 */
@Entity('product_variants')
@Index('idx_product_variants_product_id', ['product_id'])
@Index('idx_product_variants_product_active', ['product_id', 'is_active'])
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  /**
   * Whether this variant is available for purchase
   */
  @Column({ default: true })
  is_active: boolean;

  /**
   * The attribute value combinations that define this variant
   */
  @OneToMany(() => ProductVariantCombination, (combo) => combo.variant, {
    cascade: true,
    eager: true,
  })
  combinations: ProductVariantCombination[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
