import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

@Entity('banners')
@Index('idx_banners_visible', ['visible'])
@Index('idx_banners_sort_order', ['sort_order'])
export class Banner {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ nullable: true })
    image: string;

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