import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SearchSynonymConcept } from './search-synonym-concept.entity';

/**
 * A Tag is a short lowercase label attached to products (e.g. "phone", "foldable").
 * Each tag links to one or more SearchSynonymConcepts.
 * During indexing, all terms from APPROVED concepts are added to the Typesense document.
 */
@Entity('tags')
@Index('idx_tags_name', ['name'], { unique: true })
export class Tag {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true })
  name: string;

  @ManyToMany(() => SearchSynonymConcept, (concept) => concept.tags, { eager: false })
  @JoinTable({
    name: 'tag_concepts',
    joinColumn: { name: 'tag_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'concept_id', referencedColumnName: 'id' },
  })
  concepts: SearchSynonymConcept[];

  /** Inverse side — used to find products needing reindex when tag/concept changes. */
  @ManyToMany('Product', (product: any) => product.tags, { eager: false })
  products: any[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
