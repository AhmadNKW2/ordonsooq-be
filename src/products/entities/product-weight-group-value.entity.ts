import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProductWeightGroup } from './product-weight-group.entity';
import { Attribute } from '../../attributes/entities/attribute.entity';
import { AttributeValue } from '../../attributes/entities/attribute-value.entity';

/**
 * Junction table linking weight groups to their defining attribute values.
 * Each row represents one attribute-value pair that defines the group.
 * 
 * Example: If Size=Large defines a weight group,
 * there will be one row for Size=Large
 */
@Entity('product_weight_group_values')
@Unique(['weight_group_id', 'attribute_id'])
export class ProductWeightGroupValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  weight_group_id: number;

  @ManyToOne(() => ProductWeightGroup, (group) => group.groupValues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'weight_group_id' })
  weightGroup: ProductWeightGroup;

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
}
