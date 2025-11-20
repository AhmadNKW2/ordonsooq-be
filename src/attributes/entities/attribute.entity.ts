import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AttributeValue } from './attribute-value.entity';

@Entity('attributes')
export class Attribute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name_en: string;

  @Column()
  name_ar: string;

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
