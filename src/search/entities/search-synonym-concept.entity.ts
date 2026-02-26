import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToMany,
} from 'typeorm';
import type { Tag } from './tag.entity';

export enum SynonymConceptStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum SynonymConceptSource {
  AI = 'ai',
  MANUAL = 'manual',
}

@Entity('search_synonym_concepts')
@Index('idx_synonym_concepts_status', ['status'])
@Index('idx_synonym_concepts_concept_key', ['concept_key'], { unique: true })
export class SearchSynonymConcept {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Unique key used as the Typesense synonym ID.
   * e.g. "phone", "laptop", "power_bank"
   */
  @Column({ unique: true })
  concept_key: string;

  /**
   * English terms for this concept.
   * e.g. ["phone", "mobile", "smartphone"]
   */
  @Column({ type: 'jsonb', default: [] })
  terms_en: string[];

  /**
   * Arabic terms for this concept.
   * e.g. ["هاتف", "موبايل", "جوال"]
   */
  @Column({ type: 'jsonb', default: [] })
  terms_ar: string[];

  @Column({
    type: 'enum',
    enum: SynonymConceptStatus,
    default: SynonymConceptStatus.PENDING,
  })
  status: SynonymConceptStatus;

  @Column({
    type: 'enum',
    enum: SynonymConceptSource,
    default: SynonymConceptSource.AI,
  })
  source: SynonymConceptSource;

  /**
   * The Typesense synonym ID pushed on approval.
   * Equals concept_key when approved, null otherwise.
   */
  @Column({ nullable: true, type: 'varchar' })
  typesense_synonym_id: string | null;

  @Column({ nullable: true, type: 'int' })
  created_by: number | null;

  @Column({ nullable: true, type: 'int' })
  updated_by: number | null;

  @Column({ nullable: true, type: 'int' })
  approved_by: number | null;

  @Column({ nullable: true, type: 'timestamp' })
  approved_at: Date | null;

  @Column({ nullable: true, type: 'int' })
  rejected_by: number | null;

  @Column({ nullable: true, type: 'timestamp' })
  rejected_at: Date | null;

  /** Inverse side of the tag_concepts relation */
  @ManyToMany('Tag', (tag: Tag) => tag.concepts)
  tags: Tag[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
