import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('countries_world')
export class CountryWorld {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name_en: string;

  @Column({ length: 100 })
  name_ar: string;

  @Column({ type: 'text' })
  image_url: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
