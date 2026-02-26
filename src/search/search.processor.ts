import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SEARCH_QUEUE } from './tags.service';

/**
 * BullMQ worker that processes reindex-product jobs.
 * ProductsService is injected lazily via ModuleRef to avoid circular deps.
 */
@Processor(SEARCH_QUEUE)
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  // ProductsService injected via setter to avoid circular dependency
  private productsService: { syncToIndexPublic: (id: number) => Promise<void> } | null = null;

  setProductsService(svc: { syncToIndexPublic: (id: number) => Promise<void> }) {
    this.productsService = svc;
  }

  async process(job: Job<{ productId: number }>): Promise<void> {
    const { productId } = job.data;
    this.logger.debug(`Reindexing product #${productId}`);

    if (!this.productsService) {
      this.logger.warn('ProductsService not injected — skipping reindex');
      return;
    }

    try {
      await this.productsService.syncToIndexPublic(productId);
    } catch (err: any) {
      this.logger.error(`Failed to reindex product #${productId}: ${err?.message}`);
      throw err; // let BullMQ retry
    }
  }
}
