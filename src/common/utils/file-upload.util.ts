import { diskStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';

export const UPLOAD_FOLDERS = {
  PRODUCTS: 'uploads/products',
  CATEGORIES: 'uploads/categories',
} as const;

export const FILE_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_FILES: 10,
};

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'];

export const createMulterStorage = (folder: string) => {
  return diskStorage({
    destination: (req, file, cb) => {
      cb(null, folder);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });
};

export const imageFileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException(`Only image files are allowed. Supported: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false);
  }
};

export const videoFileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException(`Only video files are allowed. Supported: ${ALLOWED_VIDEO_TYPES.join(', ')}`), false);
  }
};

export const editFileName = (req: any, file: Express.Multer.File, cb: any) => {
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
  cb(null, uniqueName);
};

export const imageOrVideoFileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException(`Only image/video files are allowed`), false);
  }
};

export const getFileUrl = (filename: string, folder: string): string => {
  return `/${folder}/${filename}`;
};

export const normalizeFilePath = (filePath: string): string => {
  return filePath.replace(/\\/g, '/');
};
