import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AttributeValue } from './attribute-value.entity';

@Entity('attributes')
@Index('idx_attributes_is_active', ['is_active'])
@Index('idx_attributes_parent_id', ['parent_id'])
export class Attribute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name_en: string;

  @Column()
  name_ar: string;

  @Column({ nullable: true })
  unit_en: string;

  @Column({ nullable: true })
  unit_ar: string;

  @Column({ nullable: true })
  parent_id: number;

  @ManyToOne(() => Attribute, (attribute) => attribute.children, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Attribute;

  @Column({ nullable: true })
  parent_value_id: number;

  @ManyToOne(() => AttributeValue, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_value_id' })
  parent_value: AttributeValue;

  @OneToMany(() => Attribute, (attribute) => attribute.parent)
  children: Attribute[];

  @Column({ default: 'text' })
  type: string; // 'color', 'size', 'text', 'image'

  @Column({ default: false })
  is_color: boolean;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => AttributeValue, (value) => value.attribute, {
    cascade: true,
  })
  values: AttributeValue[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Virtual property to store the depth level (0 = root)
  level?: number;
}
