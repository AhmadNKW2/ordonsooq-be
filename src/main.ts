import { NestFactory } from '@nestjs/core';
import { ValidationPipe, NestApplicationOptions } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust reverse proxy headers (Render/Vercel) so req.secure can reflect HTTPS.
  // This helps when deciding cookie `secure` / `sameSite` options.
  app.set('trust proxy', 1);

  // Create upload directories if they don't exist
  const uploadDirs = [
    'uploads',
    'uploads/products',
    'uploads/categories',
    'uploads/vendors',
  ];
  uploadDirs.forEach((dir) => {
    const uploadPath = join(process.cwd(), dir);
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
  });

  // Serve static files
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // Enable cookie parsing for HTTP-only cookie authentication
  app.use(cookieParser());

  // Global exception filter for standardized error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptor for standardized success responses
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove unknown properties
      forbidNonWhitelisted: true, // Throw error for unknown properties
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Automatically convert types (e.g., string "3" to number 3)
      },
    }),
  );

  // Enable CORS with credentials support for cookie-based auth
  const isProduction = process.env.IS_PRODUCTION === 'true';
  const allowedOrigins = [
    'https://ordonsooq-public.vercel.app',
    'https://ordonsooq.com',
    'https://www.ordonsooq.com',
    'https://ordonsooq-admin-fe.vercel.app',
    'http://localhost:3000',
    'http://localhost:3002',
    'https://appleid.apple.com',
  ];

  console.log('CORS Configuration:');
  console.log('- IS_PRODUCTION:', isProduction);
  console.log('- Allowed Origins:', allowedOrigins);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      const isAllowed = allowedOrigins.includes(origin);

      if (isAllowed) {
        return callback(null, true);
      }
      console.warn(`CORS blocked - Origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
        // origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    optionsSuccessStatus: 204,
  });

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
}
bootstrap();
