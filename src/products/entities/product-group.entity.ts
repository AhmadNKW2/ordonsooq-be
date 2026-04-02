import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { GroupProduct } from './group-product.entity';

@Entity('groups')
export class ProductGroup {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ nullable: true })
  name: string | null;

  @OneToMany(() => GroupProduct, (groupProduct) => groupProduct.group)
  groupProducts: GroupProduct[];
}