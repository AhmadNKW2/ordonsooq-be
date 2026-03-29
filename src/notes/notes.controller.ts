import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { FilterNoteDto } from './dto/filter-note.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('notes')
@UseGuards(OptionalJwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  create(@Request() req, @Body() createNoteDto: CreateNoteDto) {
    return this.notesService.create(req.user, createNoteDto);
  }

  @Get()
  findAll(@Request() req, @Query() filterDto: FilterNoteDto) {
    return this.notesService.findAll(req.user, filterDto);
  }

  @Get('product/:productId')
  findByProduct(@Request() req, @Param('productId') productId: string, @Query() filterDto: FilterNoteDto) {
    return this.notesService.findByProduct(req.user, +productId, filterDto);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.notesService.findOne(req.user, +id);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateNoteDto: UpdateNoteDto,
  ) {
    return this.notesService.update(req.user, +id, updateNoteDto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.notesService.remove(req.user, +id);
  }
}
