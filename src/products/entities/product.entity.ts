import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
    BeforeInsert,
    Index,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';
import { ProductVariant } from './product-variant.entity';
import { ProductPriceGroup } from './product-price-group.entity';
import { ProductWeightGroup } from './product-weight-group.entity';
import { ProductMedia } from './product-media.entity';
import { ProductMediaGroup } from './product-media-group.entity';
import { ProductStock } from './product-stock.entity';
import { ProductAttribute } from './product-attribute.entity';

export enum PricingType {
    SINGLE = 'single',
    VARIANT = 'variant',
}

@Entity('products')
@Index('idx_products_category_id', ['category_id'])
@Index('idx_products_vendor_id', ['vendor_id'])
@Index('idx_products_is_active', ['is_active'])
@Index('idx_products_sku', ['sku'])
export class Product {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column()
    name_en: string;

    @Column()
    name_ar: string;

    @Column({ unique: true })
    sku: string;

    @Column('text')
    short_description_en: string;

    @Column('text')
    short_description_ar: string;

    @Column('text')
    long_description_en: string;

    @Column('text')
    long_description_ar: string;

    @Column({
        type: 'enum',
        enum: PricingType,
        default: PricingType.SINGLE,
    })
    pricing_type: PricingType;

    @Column({ default: true })
    is_active: boolean;

    // Category relationship
    @ManyToOne(() => Category, category => category.products)
    @JoinColumn({ name: 'category_id' })
    category: Category;

    @Column()
    category_id: number;

    // Vendor relationship
    @ManyToOne(() => Vendor)
    @JoinColumn({ name: 'vendor_id' })
    vendor: Vendor;

    @Column({ nullable: true })
    vendor_id: number;

    // Variants relationship (for variant products)
    @OneToMany(() => ProductVariant, (variant) => variant.product)
    variants: ProductVariant[];

    // Media relationship (unified - works for both simple and variant)
    @OneToMany(() => ProductMedia, (media) => media.product)
    media: ProductMedia[];

    // Media groups relationship
    @OneToMany(() => ProductMediaGroup, (group) => group.product)
    mediaGroups: ProductMediaGroup[];

    // Price groups relationship
    @OneToMany(() => ProductPriceGroup, (group) => group.product)
    priceGroups: ProductPriceGroup[];

    // Weight groups relationship
    @OneToMany(() => ProductWeightGroup, (group) => group.product)
    weightGroups: ProductWeightGroup[];

    // Stock relationship (unified - works for both simple and variant)
    @OneToMany(() => ProductStock, (stock) => stock.product)
    stock: ProductStock[];

    // Product attributes relationship
    @OneToMany(() => ProductAttribute, (attr) => attr.product)
    attributes: ProductAttribute[];

    // Ratings relationship
    @OneToMany('Rating', 'product')
    ratings: any[];

    @Column('decimal', { precision: 3, scale: 2, default: 0 })
    average_rating: number;

    @Column({ default: 0 })
    total_ratings: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @BeforeInsert()
    generateSku() {
        if (!this.sku) {
            const timestamp = Date.now().toString().slice(-8);
            const random = Math.random().toString(36).substring(2, 6).toUpperCase();
            this.sku = `PRD-${timestamp}-${random}`;
        }
    }
}