import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Tag } from './entities/tag.entity';
import { SearchSynonymConcept, SynonymConceptStatus } from './entities/search-synonym-concept.entity';
import { AiConceptService } from './ai-concept.service';

export const SEARCH_QUEUE = 'search';

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>,
    @InjectRepository(SearchSynonymConcept)
    private readonly conceptsRepository: Repository<SearchSynonymConcept>,
    private readonly aiConceptService: AiConceptService,
    @InjectQueue(SEARCH_QUEUE)
    private readonly searchQueue: Queue,
  ) {}

  // ─── Find or create a tag by name ──────────────────────────────────────────

  /**
   * Called when admin adds a tag to a product.
   * If tag already exists returns it. If new: creates it, fires AI in background.
   */
  async findOrCreate(name: string): Promise<Tag> {
    const normalized = name.toLowerCase().trim();

    let tag = await this.tagsRepository.findOne({
      where: { name: normalized },
      relations: ['concepts'],
    });

    if (tag) return tag;

    tag = this.tagsRepository.create({ name: normalized });
    tag = await this.tagsRepository.save(tag);

    // Fire AI concept generation in background (non-blocking)
    void this.generateAndLinkConceptForTag(tag);

    return tag;
  }

  // ─── List all tags (admin) ──────────────────────────────────────────────────

  async findAll(page = 1, perPage = 50) {
    const [items, total] = await this.tagsRepository.findAndCount({
      relations: ['concepts'],
      order: { name: 'ASC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return {
      items,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    };
  }

  // ─── Get one tag ────────────────────────────────────────────────────────────

  async findOne(id: number): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({
      where: { id },
      relations: ['concepts'],
    });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return tag;
  }

  // ─── Delete a tag ───────────────────────────────────────────────────────────

  async delete(id: number): Promise<void> {
    const tag = await this.findOne(id);
    await this.tagsRepository.remove(tag);
  }

  // ─── Link concept to tag ────────────────────────────────────────────────────

  async linkConceptToTag(tagId: number, conceptId: string): Promise<Tag> {
    const [tag, concept] = await Promise.all([
      this.tagsRepository.findOne({ where: { id: tagId }, relations: ['concepts'] }),
      this.conceptsRepository.findOne({ where: { id: conceptId } }),
    ]);

    if (!tag) throw new NotFoundException(`Tag ${tagId} not found`);
    if (!concept) throw new NotFoundException(`Concept ${conceptId} not found`);

    const alreadyLinked = tag.concepts?.some((c) => c.id === conceptId);
    if (alreadyLinked) throw new ConflictException('Concept already linked to this tag');

    await this.tagsRepository
      .createQueryBuilder()
      .relation(Tag, 'concepts')
      .of(tagId)
      .add(conceptId);

    // Reindex all products linked to this tag
    void this.reindexProductsByTagId(tagId);

    return this.findOne(tagId);
  }

  // ─── Unlink concept from tag ────────────────────────────────────────────────

  async unlinkConceptFromTag(tagId: number, conceptId: string): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({
      where: { id: tagId },
      relations: ['concepts'],
    });
    if (!tag) throw new NotFoundException(`Tag ${tagId} not found`);

    const linked = tag.concepts?.some((c) => c.id === conceptId);
    if (!linked) throw new NotFoundException('Concept is not linked to this tag');

    await this.tagsRepository
      .createQueryBuilder()
      .relation(Tag, 'concepts')
      .of(tagId)
      .remove(conceptId);

    void this.reindexProductsByTagId(tagId);

    return this.findOne(tagId);
  }

  // ─── Core: get all search terms for a list of tag IDs ──────────────────────

  /**
   * Returns all terms (EN+AR) from APPROVED concepts of the given tags,
   * plus the tag names themselves.
   * This is the array stored in the Typesense `tags` field.
   */
  async getSearchTermsForTags(tagIds: number[]): Promise<string[]> {
    if (!tagIds.length) return [];

    const tags = await this.tagsRepository.find({
      where: { id: In(tagIds) },
      relations: ['concepts'],
    });

    const terms = new Set<string>();

    for (const tag of tags) {
      terms.add(tag.name);

      for (const concept of tag.concepts ?? []) {
        if (concept.status === SynonymConceptStatus.APPROVED) {
          concept.terms_en?.forEach((t) => terms.add(t.toLowerCase().trim()));
          concept.terms_ar?.forEach((t) => terms.add(t.trim()));
        }
      }
    }

    return Array.from(terms);
  }

  // ─── Get all product IDs linked to a concept ────────────────────────────────

  /**
   * Used when a concept is approved/updated to determine which products to reindex.
   */
  async getProductIdsByConceptId(conceptId: string): Promise<number[]> {
    // Find tags linked to this concept
    const tags = await this.tagsRepository
      .createQueryBuilder('tag')
      .innerJoin('tag.concepts', 'concept', 'concept.id = :conceptId', { conceptId })
      .leftJoinAndSelect('tag.products', 'product')
      .getMany();

    const productIds = tags.flatMap(
      (tag) => tag.products?.map((p: any) => p.id) ?? [],
    );

    return [...new Set(productIds)];
  }

  // ─── Enqueue reindex jobs for all products of a tag ─────────────────────────

  async reindexProductsByTagId(tagId: number): Promise<void> {
    const tag = await this.tagsRepository.findOne({
      where: { id: tagId },
      relations: ['products'],
    });

    if (!tag?.products?.length) return;

    for (const product of tag.products) {
      await this.searchQueue.add('reindex-product', { productId: product.id });
    }

    this.logger.log(
      `Enqueued reindex for ${tag.products.length} products (tag: "${tag.name}")`,
    );
  }

  // ─── Enqueue reindex jobs for a list of product IDs ─────────────────────────

  async enqueueReindexForProducts(productIds: number[]): Promise<void> {
    for (const productId of productIds) {
      await this.searchQueue.add('reindex-product', { productId });
    }
    if (productIds.length) {
      this.logger.log(`Enqueued reindex for ${productIds.length} products`);
    }
  }

  // ─── Private: AI concept generation for a new tag ──────────────────────────

  private async generateAndLinkConceptForTag(tag: Tag): Promise<void> {
    try {
      // Check if concept with same key already exists
      let concept = await this.conceptsRepository.findOne({
        where: { concept_key: tag.name },
      });

      if (!concept) {
        const generated = await this.aiConceptService.generateTermsForTagName(tag.name);

        concept = await this.conceptsRepository.save(
          this.conceptsRepository.create({
            concept_key: tag.name,
            terms_en: generated?.terms_en ?? [],
            terms_ar: generated?.terms_ar ?? [],
            status: SynonymConceptStatus.PENDING,
            source: 'ai' as any,
          }),
        );

        this.logger.log(`🆕 Auto-created pending concept for tag "${tag.name}"`);
      }

      // Link concept to tag (if not already linked)
      const tagWithConcepts = await this.tagsRepository.findOne({
        where: { id: tag.id },
        relations: ['concepts'],
      });

      const alreadyLinked = tagWithConcepts?.concepts?.some(
        (c) => c.id === concept!.id,
      );

      if (!alreadyLinked) {
        await this.tagsRepository
          .createQueryBuilder()
          .relation(Tag, 'concepts')
          .of(tag.id)
          .add(concept.id);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to generate concept for tag "${tag.name}": ${err?.message}`,
      );
    }
  }
}
