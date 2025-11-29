import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Media, MediaType } from './entities/media.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media)
    private mediaRepository: Repository<Media>,
  ) {}

  /**
   * Create a new media record after file upload
   */
  async create(
    url: string,
    type: MediaType = MediaType.IMAGE,
    originalName?: string,
    mimeType?: string,
    size?: number,
  ): Promise<Media> {
    const media = this.mediaRepository.create({
      url,
      type,
      original_name: originalName,
      mime_type: mimeType,
      size,
    });
    return this.mediaRepository.save(media);
  }

  /**
   * Find media by ID
   */
  async findOne(id: number): Promise<Media> {
    const media = await this.mediaRepository.findOne({ where: { id } });
    if (!media) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }
    return media;
  }

  /**
   * Find multiple media by IDs
   */
  async findByIds(ids: number[]): Promise<Media[]> {
    if (ids.length === 0) return [];
    return this.mediaRepository.find({
      where: { id: In(ids) },
    });
  }

  /**
   * Delete media by ID
   */
  async delete(id: number): Promise<void> {
    const result = await this.mediaRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }
  }
}
