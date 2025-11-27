import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';
import { AttributeValue } from '../../attributes/entities/attribute-value.entity';

/**
 * Junction table linking a ProductVariant to its AttributeValues.
 * 
 * Example: A "Red + Small" variant would have two records:
 * - variant_id: 1, attribute_value_id: 5 (Red)
 * - variant_id: 1, attribute_value_id: 10 (Small)
 */
@Entity('product_variant_combinations')
@Unique('uq_variant_attribute_value', ['variant_id', 'attribute_value_id'])
@Index('idx_product_variant_combinations_variant_id', ['variant_id'])
@Index('idx_product_variant_combinations_attribute_value_id', ['attribute_value_id'])
export class ProductVariantCombination {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  variant_id: number;

  @ManyToOne(() => ProductVariant, (variant) => variant.combinations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column()
  attribute_value_id: number;

  @ManyToOne(() => AttributeValue, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'attribute_value_id' })
  attribute_value: AttributeValue;

  @CreateDateColumn()
  created_at: Date;
}
