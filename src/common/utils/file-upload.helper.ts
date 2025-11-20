import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

// File filter for images and videos
export const mediaFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|avi|mov|wmv|flv|webm/;
  const ext = extname(file.originalname).toLowerCase().slice(1);
  const mimetype = file.mimetype;

  const isImage = allowedImageTypes.test(ext) && mimetype.startsWith('image/');
  const isVideo = allowedVideoTypes.test(ext) && mimetype.startsWith('video/');

  if (isImage || isVideo) {
    callback(null, true);
  } else {
    callback(
      new BadRequestException(
        'Invalid file type. Only images (jpeg, jpg, png, gif, webp) and videos (mp4, avi, mov, wmv, flv, webm) are allowed.',
      ),
      false,
    );
  }
};

// File filter for images only
export const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const ext = extname(file.originalname).toLowerCase().slice(1);
  const mimetype = file.mimetype;

  if (allowedTypes.test(ext) && mimetype.startsWith('image/')) {
    callback(null, true);
  } else {
    callback(
      new BadRequestException(
        'Invalid file type. Only images (jpeg, jpg, png, gif, webp) are allowed.',
      ),
      false,
    );
  }
};

// Generate unique filename
export const editFileName = (
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, filename: string) => void,
) => {
  const name = file.originalname.split('.')[0];
  const fileExtName = extname(file.originalname);
  const randomName = Array(16)
    .fill(null)
    .map(() => Math.round(Math.random() * 16).toString(16))
    .join('');
  callback(null, `${name}-${Date.now()}-${randomName}${fileExtName}`);
};
