import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Index,
    Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('product_categories')
@Unique('UQ_product_category', ['product_id', 'category_id'])
@Index('idx_product_categories_product_id', ['product_id'])
@Index('idx_product_categories_category_id', ['category_id'])
export class ProductCategory {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column()
    product_id: number;

    @Column()
    category_id: number;

    @ManyToOne(() => Product, product => product.productCategories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @ManyToOne(() => Category, category => category.productCategories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'category_id' })
    category: Category;

    @CreateDateColumn()
    created_at: Date;
}
