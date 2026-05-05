import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_input_jsons')
@Index('idx_product_input_jsons_product_id', ['product_id'], { unique: true })
export class ProductInputJson {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  product_id: number;

  @OneToOne(() => Product, (product) => product.product_input_json, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'jsonb' })
  input_json: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}