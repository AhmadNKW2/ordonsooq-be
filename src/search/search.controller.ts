import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto, AutocompleteQueryDto } from './dto/search-query.dto';
import {
  SearchResponseDto,
  AutocompleteResponseDto,
} from './dto/search-response.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Full product search with filters, facets, pagination, and sorting.
   * GET /search?q=iphone&brand=Apple&category=Phones&page=1&per_page=20
   */
  @Get()
  search(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(query);
  }

  /**
   * Fast autocomplete suggestions as the user types.
   * GET /search/autocomplete?q=iph&per_page=8
   */
  @Get('autocomplete')
  autocomplete(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AutocompleteQueryDto,
  ): Promise<AutocompleteResponseDto> {
    return this.searchService.autocomplete(query);
  }
}
