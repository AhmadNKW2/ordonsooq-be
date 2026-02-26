import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ValidationPipe,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SynonymConceptService } from './synonym-concept.service';
import {
  UpdateSynonymConceptDto,
  CreateManualSynonymConceptDto,
  ListSynonymConceptsQueryDto,
} from './dto/synonym-concept.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Admin endpoints for synonym concept CRUD + approve/reject/disable.
 *
 * Reindex endpoints live at POST /products/reindex (ProductsController).
 */
@UseGuards(JwtAuthGuard)
@Controller('admin/search')
export class AdminSearchController {
  constructor(
    private readonly synonymConceptService: SynonymConceptService,
  ) {}

  /**
   * GET /admin/search/concepts?status=pending&page=1&per_page=20
   */
  @Get('concepts')
  listConcepts(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListSynonymConceptsQueryDto,
  ) {
    return this.synonymConceptService.list(query);
  }

  /**
   * GET /admin/search/concepts/:id
   */
  @Get('concepts/:id')
  getConcept(@Param('id', ParseUUIDPipe) id: string) {
    return this.synonymConceptService.findOne(id);
  }

  /**
   * POST /admin/search/concepts
   * Create a manual synonym concept (starts as pending).
   */
  @Post('concepts')
  createConcept(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateManualSynonymConceptDto,
  ) {
    return this.synonymConceptService.createManual(dto);
  }

  /**
   * PUT /admin/search/concepts/:id
   * Edit concept_key, terms_en, terms_ar.
   * If already approved, changes are re-synced to Typesense immediately.
   */
  @Put('concepts/:id')
  updateConcept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateSynonymConceptDto,
  ) {
    return this.synonymConceptService.update(id, dto);
  }

  /**
   * POST /admin/search/concepts/:id/approve
   * Validates terms then pushes synonym to Typesense immediately.
   */
  @Post('concepts/:id/approve')
  approveConcept(@Param('id', ParseUUIDPipe) id: string) {
    return this.synonymConceptService.approve(id);
  }

  /**
   * POST /admin/search/concepts/:id/reject
   * Marks as rejected. Removes from Typesense if was previously approved.
   */
  @Post('concepts/:id/reject')
  rejectConcept(@Param('id', ParseUUIDPipe) id: string) {
    return this.synonymConceptService.reject(id);
  }

  /**
   * POST /admin/search/concepts/:id/disable
   * Removes an approved synonym from Typesense and marks it rejected.
   */
  @Post('concepts/:id/disable')
  disableConcept(@Param('id', ParseUUIDPipe) id: string) {
    return this.synonymConceptService.disable(id);
  }

  /**
   * DELETE /admin/search/concepts/:id
   * Permanently deletes the concept from DB (and Typesense if approved).
   */
  @Delete('concepts/:id')
  deleteConcept(@Param('id', ParseUUIDPipe) id: string) {
    return this.synonymConceptService.delete(id);
  }
}
