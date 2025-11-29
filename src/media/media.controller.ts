import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { MediaService } from './media.service';
import { MediaType } from './entities/media.entity';
import { Roles, UserRole } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { mediaFileFilter, editFileName } from '../common/utils/file-upload.helper';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Upload a media file (image or video)
   * 
   * This is a generic upload endpoint - files are uploaded independently
   * and can be linked to products later.
   * 
   * Returns: { id, url, type, original_name, mime_type, size, created_at }
   * 
   * Usage:
   * 1. Frontend uploads file immediately when user drops/selects it
   * 2. Frontend stores returned ID in component state
   * 3. When saving product, frontend sends media IDs in payload
   */
  @Post('upload')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/products',
        filename: editFileName,
      }),
      fileFilter: mediaFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const url = `${process.env.APP_URL || 'http://localhost:3001'}/uploads/products/${file.filename}`;
    const type = file.mimetype.startsWith('video/') ? MediaType.VIDEO : MediaType.IMAGE;

    const media = await this.mediaService.create(
      url,
      type,
      file.originalname,
      file.mimetype,
      file.size,
    );

    return media;
  }

  /**
   * Get media by ID
   */
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne(+id);
  }

  /**
   * Delete media by ID
   * Note: This only deletes the database record. 
   * File cleanup should be handled by a garbage collector process.
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async delete(@Param('id') id: string) {
    await this.mediaService.delete(+id);
    return { message: 'Media deleted successfully' };
  }
}
