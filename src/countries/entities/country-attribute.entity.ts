import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Country } from './country.entity';
import { Attribute } from '../../attributes/entities/attribute.entity';

@Entity('country_attributes')
export class CountryAttribute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'country_id' })
  countryId: number;

  @ManyToOne(() => Country, (country) => country.attributes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'country_id' })
  country: Country;

  @Column({ name: 'attribute_id' })
  attributeId: number;

  @ManyToOne(() => Attribute)
  @JoinColumn({ name: 'attribute_id' })
  attribute: Attribute;

  @Column({ name: 'value_en', type: 'text' })
  value_en: string;

  @Column({ name: 'value_ar', type: 'text', nullable: true })
  value_ar: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
