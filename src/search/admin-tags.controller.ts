import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { TagsService } from './tags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

class LinkConceptDto {
  @IsString()
  @IsNotEmpty()
  concept_id: string;
}

@UseGuards(JwtAuthGuard)
@Controller('admin/tags')
export class AdminTagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * GET /admin/tags?page=1&per_page=50
   */
  @Get()
  listTags(
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    return this.tagsService.findAll(
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 50,
    );
  }

  /**
   * GET /admin/tags/:id
   */
  @Get(':id')
  getTag(@Param('id', ParseIntPipe) id: number) {
    return this.tagsService.findOne(id);
  }

  /**
   * POST /admin/tags
   * Create (or find) a tag by name.
   */
  @Post()
  createTag(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateTagDto,
  ) {
    return this.tagsService.findOrCreate(dto.name);
  }

  /**
   * DELETE /admin/tags/:id
   */
  @Delete(':id')
  deleteTag(@Param('id', ParseIntPipe) id: number) {
    return this.tagsService.delete(id);
  }

  /**
   * POST /admin/tags/:id/concepts
   * body: { concept_id: string }
   */
  @Post(':id/concepts')
  linkConcept(
    @Param('id', ParseIntPipe) tagId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: LinkConceptDto,
  ) {
    return this.tagsService.linkConceptToTag(tagId, dto.concept_id);
  }

  /**
   * DELETE /admin/tags/:id/concepts/:conceptId
   */
  @Delete(':id/concepts/:conceptId')
  unlinkConcept(
    @Param('id', ParseIntPipe) tagId: number,
    @Param('conceptId', ParseUUIDPipe) conceptId: string,
  ) {
    return this.tagsService.unlinkConceptFromTag(tagId, conceptId);
  }
}
