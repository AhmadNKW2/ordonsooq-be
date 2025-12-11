import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

export interface UploadResult {
  key: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class R2StorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;
  private readonly logger = new Logger(R2StorageService.name);

  constructor(private configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME') || 'ordonsooq-media';

    // R2 endpoint format
    const endpoint = this.configService.get<string>('R2_ENDPOINT') ||
      `https://${accountId}.r2.cloudflarestorage.com`;

    // Public URL for accessing files (you may need to set up a custom domain or use R2.dev subdomain)
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL') ||
      `https://pub-${accountId}.r2.dev`;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });

    this.logger.log(`R2 Storage initialized with bucket: ${this.bucketName}`);
  }

  /**
   * Upload a file to R2
   * @param file - The file buffer or Express.Multer.File
   * @param folder - The folder/prefix to store the file in (e.g., 'products', 'banners')
   * @returns Upload result with key, URL, and file metadata
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadResult> {
    const ext = extname(file.originalname).toLowerCase();
    const uniqueId = uuidv4();
    const key = `${folder}/${uniqueId}${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          // Set cache control for better CDN performance
          CacheControl: 'public, max-age=31536000',
        }),
      );

      const url = `${this.publicUrl}/${key}`;

      this.logger.log(`File uploaded successfully: ${key}`);

      return {
        key,
        url,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a file from R2
   * @param keyOrUrl - The key or full URL of the file to delete
   */
  async deleteFile(keyOrUrl: string): Promise<void> {
    // Extract key from URL if full URL is provided
    const key = this.extractKeyFromUrl(keyOrUrl);

    if (!key) {
      this.logger.warn(`Cannot extract key from: ${keyOrUrl}`);
      return;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete multiple files from R2
   * @param keysOrUrls - Array of keys or URLs to delete
   */
  async deleteFiles(keysOrUrls: string[]): Promise<void> {
    if (keysOrUrls.length === 0) return;

    const keys = keysOrUrls
      .map((keyOrUrl) => this.extractKeyFromUrl(keyOrUrl))
      .filter((key): key is string => key !== null);

    if (keys.length === 0) {
      this.logger.warn('No valid keys to delete');
      return;
    }

    try {
      // R2/S3 allows up to 1000 objects per delete request
      const batchSize = 1000;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucketName,
            Delete: {
              Objects: batch.map((Key) => ({ Key })),
            },
          }),
        );
      }

      this.logger.log(`Deleted ${keys.length} files successfully`);
    } catch (error) {
      this.logger.error(`Failed to delete files: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Extract the storage key from a URL or return the key if already a key
   */
  private extractKeyFromUrl(keyOrUrl: string): string | null {
    if (!keyOrUrl) return null;

    // If it's already a key (no http/https), return as is
    if (!keyOrUrl.startsWith('http://') && !keyOrUrl.startsWith('https://')) {
      return keyOrUrl;
    }

    try {
      const url = new URL(keyOrUrl);
      // Remove leading slash from pathname
      return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    } catch {
      this.logger.warn(`Invalid URL format: ${keyOrUrl}`);
      return null;
    }
  }

  /**
   * Get the public URL for a given key
   */
  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
