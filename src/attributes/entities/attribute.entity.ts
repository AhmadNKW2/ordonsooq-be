import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { AttributeValue } from './attribute-value.entity';

@Entity('attributes')
@Index('idx_attributes_is_active', ['is_active'])
export class Attribute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name_en: string;

  @Column()
  name_ar: string;

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
}
