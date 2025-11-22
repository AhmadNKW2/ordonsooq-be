import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CountryWorld } from '../../countries-world/entities/country-world.entity';
import { CountryAttribute } from './country-attribute.entity';

@Entity('countries')
export class Country {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'country_world_id' })
  countryWorldId: number;

  @ManyToOne(() => CountryWorld)
  @JoinColumn({ name: 'country_world_id' })
  countryWorld: CountryWorld;

  @OneToMany(() => CountryAttribute, (countryAttribute) => countryAttribute.country, { cascade: true })
  attributes: CountryAttribute[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
