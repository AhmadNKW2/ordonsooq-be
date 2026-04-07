import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
  Index,
} from 'typeorm';
import { SpecificationValue } from './specification-value.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('specifications')
@Index('idx_specifications_is_active', ['is_active'])
@Index('idx_specifications_parent_id', ['parent_id'])
export class Specification {
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

  @ManyToOne(() => Specification, (spec) => spec.children, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Specification;

  @Column({ nullable: true })
  parent_value_id: number;

  @ManyToOne(() => SpecificationValue, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_value_id' })
  parent_value: SpecificationValue;

  @OneToMany(() => Specification, (spec) => spec.parent)
  children: Specification[];

  @Column({ nullable: true, default: false })
  list_separately?: boolean;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  for_all_categories: boolean;

  @OneToMany(() => SpecificationValue, (value) => value.specification, {
    cascade: true,
  })
  values: SpecificationValue[];

  @ManyToMany(() => Category, (category) => category.specifications)
  @JoinTable({
    name: 'specification_categories',
    joinColumn: { name: 'specification_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories: Category[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  level?: number;
}
