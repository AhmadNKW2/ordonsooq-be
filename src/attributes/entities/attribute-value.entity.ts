import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Attribute } from './attribute.entity';

@Entity('attribute_values')
@Index('idx_attribute_values_attribute_id', ['attribute_id'])
@Index('idx_attribute_values_is_active', ['is_active'])
@Index('idx_attribute_values_composite', ['attribute_id', 'is_active'])
export class AttributeValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  attribute_id: number;

  @ManyToOne(() => Attribute, (attribute) => attribute.values, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attribute_id' })
  attribute: Attribute;

  @Column({ nullable: true })
  parent_value_id: number;

  @ManyToOne(() => AttributeValue, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_value_id' })
  parent_value: AttributeValue;

  @Column()
  value_en: string;

  @Column()
  value_ar: string;

  @Column({ nullable: true })
  color_code: string; // '#FF5733' for color swatches

  @Column({ nullable: true })
  image_url: string; // For image-based attributes

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Virtual property to store the depth level (Inherited from Attribute)
  level?: number;
}
