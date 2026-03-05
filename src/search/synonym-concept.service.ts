import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SearchSynonymConcept,
  SynonymConceptStatus,
  SynonymConceptSource,
} from './entities/search-synonym-concept.entity';
import { TypesenseService } from './typesense.service';
import { AiConceptService, GeneratedConcept } from './ai-concept.service';
import { TagsService } from './tags.service';
import {
  UpdateSynonymConceptDto,
  CreateManualSynonymConceptDto,
  ListSynonymConceptsQueryDto,
} from './dto/synonym-concept.dto';

@Injectable()
export class SynonymConceptService implements OnModuleInit {
  private readonly logger = new Logger(SynonymConceptService.name);

  constructor(
    @InjectRepository(SearchSynonymConcept)
    private readonly conceptRepo: Repository<SearchSynonymConcept>,
    private readonly typesenseService: TypesenseService,
    private readonly aiConceptService: AiConceptService,
    @Inject(forwardRef(() => TagsService))
    private readonly tagsService: TagsService,
  ) {}

  /**
   * On startup: seed all approved synonyms into Typesense.
   * This restores synonyms if Typesense was wiped/restarted.
   */
  async onModuleInit() {
    try {
      const approved = await this.conceptRepo.find({
        where: { status: SynonymConceptStatus.APPROVED },
      });

      if (!approved.length) {
        this.logger.log('No approved synonym concepts to seed');
        return;
      }

      const toSeed = approved.map((c) => ({
        id: c.concept_key_en,
        terms: [...c.terms_en, ...c.terms_ar],
      }));

      await this.typesenseService.seedSynonyms(toSeed);
    } catch (err: any) {
      this.logger.error(
        `Failed to seed synonyms on startup: ${err?.message}`,
        err?.stack,
      );
    }
  }

  // ── List / Get ─────────────────────────────────────────────────────────────

  async list(query: ListSynonymConceptsQueryDto) {
    const qb = this.conceptRepo.createQueryBuilder('c');

    if (query.status) {
      qb.where('c.status = :status', { status: query.status });
    }

    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;

    qb.orderBy('c.created_at', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    };
  }

  async findOne(id: string): Promise<SearchSynonymConcept> {
    const concept = await this.conceptRepo.findOne({ where: { id } });
    if (!concept) throw new NotFoundException(`Concept ${id} not found`);
    return concept;
  }

  // ── Create (manual) ────────────────────────────────────────────────────────

  async createManual(
    dto: CreateManualSynonymConceptDto,
    adminId?: number,
  ): Promise<SearchSynonymConcept> {
    const existing = await this.conceptRepo.findOne({
      where: { concept_key_en: dto.concept_key_en },
    });
    if (existing) {
      throw new ConflictException(
        `Concept key "${dto.concept_key_en}" already exists`,
      );
    }

    const concept = this.conceptRepo.create({
      concept_key_en: dto.concept_key_en,
      concept_key_ar: (dto as any).concept_key_ar ?? null,
      terms_en: dto.terms_en,
      terms_ar: dto.terms_ar,
      status: SynonymConceptStatus.PENDING,
      source: SynonymConceptSource.MANUAL,
      created_by: adminId ?? null,
    });

    return this.conceptRepo.save(concept);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateSynonymConceptDto,
    adminId?: number,
  ): Promise<SearchSynonymConcept> {
    const concept = await this.findOne(id);

    // Check concept_key_en uniqueness if it's being changed
    if (dto.concept_key_en && dto.concept_key_en !== concept.concept_key_en) {
      const conflict = await this.conceptRepo.findOne({
        where: { concept_key_en: dto.concept_key_en },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(
          `Concept key "${dto.concept_key_en}" already exists`,
        );
      }
    }

    if (dto.concept_key_en) concept.concept_key_en = dto.concept_key_en;
    if ('concept_key_ar' in dto) concept.concept_key_ar = dto.concept_key_ar ?? null;
    if (dto.terms_en) concept.terms_en = dto.terms_en;
    if (dto.terms_ar) concept.terms_ar = dto.terms_ar;
    concept.updated_by = adminId ?? null;

    const saved = await this.conceptRepo.save(concept);

    // If already approved, re-sync to Typesense with updated terms and reindex products
    if (saved.status === SynonymConceptStatus.APPROVED) {
      const terms = [...saved.terms_en, ...saved.terms_ar];
      await this.typesenseService.upsertSynonym(saved.concept_key_en, terms);

      const productIds = await this.tagsService.getProductIdsByConceptId(id);
      await this.tagsService.enqueueReindexForProducts(productIds);
    }

    return saved;
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  async approve(id: string, adminId?: number): Promise<SearchSynonymConcept> {
    const concept = await this.findOne(id);

    if (concept.status === SynonymConceptStatus.APPROVED) {
      throw new BadRequestException('Concept is already approved');
    }

    const terms = [...concept.terms_en, ...concept.terms_ar];
    if (terms.length < 2) {
      throw new BadRequestException(
        'Cannot approve: concept must have at least 2 terms total',
      );
    }

    // Push to Typesense
    await this.typesenseService.upsertSynonym(concept.concept_key_en, terms);

    // Update DB
    concept.status = SynonymConceptStatus.APPROVED;
    concept.typesense_synonym_id = concept.concept_key_en;
    concept.approved_by = adminId ?? null;
    concept.approved_at = new Date();
    concept.rejected_by = null;
    concept.rejected_at = null;

    const saved = await this.conceptRepo.save(concept);

    // Reindex all products linked to tags of this concept
    const productIds = await this.tagsService.getProductIdsByConceptId(id);
    await this.tagsService.enqueueReindexForProducts(productIds);

    return saved;
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  async reject(id: string, adminId?: number): Promise<SearchSynonymConcept> {
    const concept = await this.findOne(id);

    if (concept.status === SynonymConceptStatus.REJECTED) {
      throw new BadRequestException('Concept is already rejected');
    }

    // If was approved, remove from Typesense
    if (concept.status === SynonymConceptStatus.APPROVED) {
      await this.typesenseService.deleteSynonym(concept.concept_key_en);
    }

    concept.status = SynonymConceptStatus.REJECTED;
    concept.typesense_synonym_id = null;
    concept.rejected_by = adminId ?? null;
    concept.rejected_at = new Date();

    return this.conceptRepo.save(concept);
  }

  // ── Disable (re-reject an approved concept) ────────────────────────────────

  async disable(id: string, adminId?: number): Promise<SearchSynonymConcept> {
    const concept = await this.findOne(id);

    if (concept.status !== SynonymConceptStatus.APPROVED) {
      throw new BadRequestException('Only approved concepts can be disabled');
    }

    await this.typesenseService.deleteSynonym(concept.concept_key_en);

    concept.status = SynonymConceptStatus.REJECTED;
    concept.typesense_synonym_id = null;
    concept.rejected_by = adminId ?? null;
    concept.rejected_at = new Date();

    return this.conceptRepo.save(concept);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const concept = await this.findOne(id);

    if (concept.status === SynonymConceptStatus.APPROVED) {
      await this.typesenseService.deleteSynonym(concept.concept_key_en);
    }

    await this.conceptRepo.remove(concept);
  }

  // ── AI generation (called by ProductsService after indexing) ───────────────

  /**
   * Generate AI concepts for a product and save them as pending.
   * Skips concepts whose concept_key_en already exists in DB.
   * Fire-and-forget safe — errors are logged, never thrown.
   */
  async generateAndSaveConceptsForProduct(input: {
    name_en: string;
    name_ar: string;
    category_names_en: string[];
    category_names_ar: string[];
    brand_en?: string;
    brand_ar?: string;
    vendor_en?: string;
    vendor_ar?: string;
    short_description_en?: string;
    short_description_ar?: string;
    long_description_en?: string;
    long_description_ar?: string;
  }): Promise<void> {
    try {
      const concepts = await this.aiConceptService.generateConcepts(input);

      for (const concept of concepts) {
        await this.upsertPendingConcept(concept);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to generate/save AI concepts: ${err?.message}`,
      );
    }
  }

  private async upsertPendingConcept(
    concept: GeneratedConcept,
  ): Promise<void> {
    const existing = await this.conceptRepo.findOne({
      where: { concept_key_en: concept.concept_key_en },
    });

    if (existing) {
      // Already exists — do not overwrite status or terms
      this.logger.debug(`Concept "${concept.concept_key_en}" already exists, skipping`);
      return;
    }

    await this.conceptRepo.save(
      this.conceptRepo.create({
        concept_key_en: concept.concept_key_en,
        concept_key_ar: concept.concept_key_ar ?? null,
        terms_en: concept.terms_en,
        terms_ar: concept.terms_ar,
        status: SynonymConceptStatus.PENDING,
        source: SynonymConceptSource.AI,
      }),
    );

    this.logger.log(`🆕 New pending concept: "${concept.concept_key_en}" / "${concept.concept_key_ar ?? ''}"`);
  }
}
