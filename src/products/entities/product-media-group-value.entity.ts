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
import { ProductMediaGroup } from './product-media-group.entity';
import { Attribute } from '../../attributes/entities/attribute.entity';
import { AttributeValue } from '../../attributes/entities/attribute-value.entity';

/**
 * Junction table linking media groups to their defining attribute values.
 * Each row represents one attribute-value pair that defines the group.
 *
 * Example: If Color=Red defines a media group,
 * there will be one row for Color=Red
 */
@Entity('product_media_group_values')
@Unique(['media_group_id', 'attribute_id'])
@Index('idx_media_group_values_media_group', ['media_group_id'])
@Index('idx_media_group_values_attribute_value', ['attribute_value_id'])
export class ProductMediaGroupValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  media_group_id: number;

  @ManyToOne(() => ProductMediaGroup, (group) => group.groupValues, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'media_group_id' })
  mediaGroup: ProductMediaGroup;

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
