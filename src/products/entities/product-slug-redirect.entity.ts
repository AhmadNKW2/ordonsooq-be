import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('product_slug_redirects')
export class ProductSlugRedirect {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  old_slug: string;

  @Column()
  new_slug: string;

  @Column({ type: 'int' })
  product_id: number;

  @CreateDateColumn()
  created_at: Date;
}