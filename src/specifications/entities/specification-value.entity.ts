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
import { Specification } from './specification.entity';

@Entity('specification_values')
@Index('idx_specification_values_spec_id', ['specification_id'])
@Index('idx_specification_values_is_active', ['is_active'])
export class SpecificationValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  specification_id: number;

  @ManyToOne(() => Specification, (spec) => spec.values, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'specification_id' })
  specification: Specification;

  @Column({ nullable: true })
  parent_value_id: number;

  @ManyToOne(() => SpecificationValue, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_value_id' })
  parent_value: SpecificationValue;

  @Column()
  value_en: string;

  @Column()
  value_ar: string;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  level?: number;
}
