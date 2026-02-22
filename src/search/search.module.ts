import { Module } from '@nestjs/common';
import { TypesenseService } from './typesense.service';
import { SearchService } from './search.service';
import { IndexingService } from './indexing.service';
import { SearchController } from './search.controller';

@Module({
  controllers: [SearchController],
  providers: [TypesenseService, SearchService, IndexingService],
  exports: [IndexingService], // Export so ProductsModule (and others) can index documents
})
export class SearchModule {}
