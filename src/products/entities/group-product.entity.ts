import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductGroup } from './product-group.entity';

@Entity('groups_products')
@Unique('UQ_groups_products_group_product', ['group_id', 'product_id'])
@Unique('UQ_groups_products_product', ['product_id'])
@Index('idx_groups_products_group_id', ['group_id'])
@Index('idx_groups_products_product_id', ['product_id'])
export class GroupProduct {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column()
  group_id: number;

  @Column()
  product_id: number;

  @ManyToOne(() => ProductGroup, (group) => group.groupProducts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id' })
  group: ProductGroup;

  @ManyToOne(() => Product, (product) => product.groupProducts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}