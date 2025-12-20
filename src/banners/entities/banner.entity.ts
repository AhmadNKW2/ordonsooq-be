import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BannerLanguage {
  EN = 'en',
  AR = 'ar',
}

@Entity('banners')
@Index('idx_banners_visible', ['visible'])
@Index('idx_banners_sort_order', ['sort_order'])
export class Banner {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ nullable: true })
  image: string;

  @Column({
    type: 'enum',
    enum: BannerLanguage,
    default: BannerLanguage.EN,
  })
  language: BannerLanguage;

  @Column({ nullable: true })
  link: string; // URL to redirect when banner is clicked

  @Column({ default: true })
  visible: boolean;

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
