import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';

export enum CategoryStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('categories')
@Index('idx_categories_parent_id', ['parent_id'])
@Index('idx_categories_status', ['status'])
@Index('idx_categories_visible', ['visible'])
@Index('idx_categories_status_visible', ['status', 'visible'])
@Index('idx_categories_sort_order', ['sortOrder'])
export class Category {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ default: '' })
  name_en: string;

  @Column({ nullable: true, unique: true })
  slug: string;

  @Column({ default: '' })
  name_ar: string;

  @Column({ nullable: true })
  description_en: string;

  @Column({ nullable: true })
  description_ar: string;

  @Column({ nullable: true })
  image: string;

  @Column({ default: 0 })
  level: number; // 0 = main category, 1 = sub, 2 = sub-sub

  @Column({ default: 0 })
  sortOrder: number;

  @Column({
    type: 'enum',
    enum: CategoryStatus,
    default: CategoryStatus.ACTIVE,
  })
  status: CategoryStatus;

  @Column({ default: true })
  visible: boolean;

  // Self-referencing for parent category
  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category;

  @Column({ nullable: true })
  parent_id: number | null;

  // Children categories
  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  // Products in this category (via junction table)
  @OneToMany('ProductCategory', 'category')
  productCategories: any[];

  // Legacy relationship (for backward compatibility)
  @OneToMany('Product', 'category')
  products: any[];

  @Column({ nullable: true, type: 'timestamp' })
  archived_at: Date | null;

  @Column({ nullable: true, type: 'int' })
  archived_by: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
