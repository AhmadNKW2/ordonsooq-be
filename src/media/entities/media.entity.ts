import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

/**
 * Unified media entity - handles both uploaded files and product-linked media
 *
 * This allows "upload first, link later" pattern:
 * 1. User uploads file -> Media entity created with url (product_id = null)
 * 2. User submits product form -> Media updated with product_id, sort_order, is_primary
 *
 * For simple products: media_group_id is null or points to a simple group
 * For variant products: media_group_id points to a group with attribute values
 */
@Entity('media')
@Index('idx_media_product_id', ['product_id'])
@Index('idx_media_media_group_id', ['media_group_id'])
@Index('idx_media_type', ['type'])
@Index('idx_media_created_at', ['created_at'])
@Index('idx_media_product_sort', ['product_id', 'sort_order'])
export class Media {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 500, nullable: true })
  url: string;

  @Column({
    type: 'enum',
    enum: MediaType,
    default: MediaType.IMAGE,
  })
  type: MediaType;

  @Column({ nullable: true })
  original_name: string;

  @Column({ nullable: true })
  mime_type: string;

  @Column({ type: 'bigint', nullable: true })
  size: number;

  @Column({ nullable: true })
  alt_text: string;

  // ===== Product Linking =====

  @Column({ nullable: true })
  product_id: number | null;

  @ManyToOne('Product', 'media', { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: any;

  @Column({ nullable: true })
  media_group_id: number | null;

  @ManyToOne('ProductMediaGroup', 'media', {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'media_group_id' })
  mediaGroup: any;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
