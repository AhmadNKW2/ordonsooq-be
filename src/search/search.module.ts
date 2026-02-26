import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TypesenseService } from './typesense.service';
import { SearchService } from './search.service';
import { IndexingService } from './indexing.service';
import { SynonymConceptService } from './synonym-concept.service';
import { AiConceptService } from './ai-concept.service';
import { TagsService, SEARCH_QUEUE } from './tags.service';
import { SearchProcessor } from './search.processor';
import { SearchController } from './search.controller';
import { AdminSearchController } from './admin-search.controller';
import { AdminTagsController } from './admin-tags.controller';
import { SearchSynonymConcept } from './entities/search-synonym-concept.entity';
import { Tag } from './entities/tag.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchSynonymConcept, Tag]),
    BullModule.registerQueue({ name: SEARCH_QUEUE }),
  ],
  controllers: [SearchController, AdminSearchController, AdminTagsController],
  providers: [
    TypesenseService,
    SearchService,
    IndexingService,
    SynonymConceptService,
    AiConceptService,
    TagsService,
    SearchProcessor,
  ],
  exports: [IndexingService, SynonymConceptService, TagsService],
})
export class SearchModule {}
