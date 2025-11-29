import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { ProductPriceGroup } from './product-price-group.entity';
import { Attribute } from '../../attributes/entities/attribute.entity';
import { AttributeValue } from '../../attributes/entities/attribute-value.entity';

/**
 * Junction table linking price groups to their defining attribute values.
 * Each row represents one attribute-value pair that defines the group.
 * 
 * Example: If Color=Red and Size=Large define a price group,
 * there will be two rows: one for Color=Red, one for Size=Large
 */
@Entity('product_price_group_values')
@Unique(['price_group_id', 'attribute_id'])
@Index('idx_price_group_values_price_group', ['price_group_id'])
@Index('idx_price_group_values_attribute_value', ['attribute_value_id'])
export class ProductPriceGroupValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  price_group_id: number;

  @ManyToOne(() => ProductPriceGroup, (group) => group.groupValues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'price_group_id' })
  priceGroup: ProductPriceGroup;

  @Column()
  attribute_id: number;

  @ManyToOne(() => Attribute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: Attribute;

  @Column()
  attribute_value_id: number;

  @ManyToOne(() => AttributeValue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_value_id' })
  attributeValue: AttributeValue;

  @CreateDateColumn()
  created_at: Date;
}
