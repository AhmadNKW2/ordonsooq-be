import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
    BeforeInsert
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

export enum PricingType {
    SINGLE = 'single',
    VARIANT = 'variant',
}

@Entity('products')
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

    // Media relationship
    @OneToMany('ProductMedia', 'product')
    media: any[];

    // Pricing relationship
    @OneToMany('ProductPricing', 'product')
    pricing: any[];

    // Weight relationship
    @OneToMany('ProductWeight', 'product')
    weight: any[];

    // Stock relationship
    @OneToMany('ProductVariantStock', 'product')
    stock: any[];

    // Variant pricing relationship
    @OneToMany('ProductVariantPricing', 'product')
    variant_pricing: any[];

    // Variant media relationship
    @OneToMany('ProductVariantMedia', 'product')
    variant_media: any[];

    // Variant weight relationship
    @OneToMany('ProductVariantWeight', 'product')
    variant_weight: any[];

    // Product attributes relationship
    @OneToMany('ProductAttribute', 'product')
    attributes: any[];

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