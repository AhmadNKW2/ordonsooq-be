import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  orderId: number;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: number;

  @ManyToOne(() => ProductVariant, { nullable: true })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;

  @Column({ nullable: true })
  variantId: number;

  @ManyToOne(() => Vendor, { nullable: true })
  @JoinColumn({ name: 'vendorId' })
  vendor: Vendor;

  @Column({ nullable: true })
  vendorId: number;

  @Column()
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number; // Unit price at purchase time

  @Column('decimal', { precision: 10, scale: 2 })
  totalPrice: number; // price * quantity
  
  @Column('jsonb', { nullable: true })
  productSnapshot: any; // Store product name, image, etc, at time of purchase
}
