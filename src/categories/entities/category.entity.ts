import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn
} from 'typeorm';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    description: string;

    @Column({ nullable: true })
    image: string;

    @Column({ default: 0 })
    level: number; // 0 = main category, 1 = sub, 2 = sub-sub

    @Column({ default: true })
    isActive: boolean;

    // Self-referencing for parent category
    @ManyToOne(() => Category, category => category.children, { nullable: true })
    @JoinColumn({ name: 'parentId' })
    parent: Category;

    @Column({ nullable: true })
    parentId: number;

    // Children categories
    @OneToMany(() => Category, category => category.parent)
    children: Category[];

    // Products in this category
    @OneToMany('Product', 'category')
    products: any[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}