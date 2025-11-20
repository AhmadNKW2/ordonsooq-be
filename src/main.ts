import { NestFactory } from '@nestjs/core';
import { ValidationPipe, NestApplicationOptions } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Create upload directories if they don't exist
  const uploadDirs = ['uploads', 'uploads/products', 'uploads/categories', 'uploads/vendors'];
  uploadDirs.forEach(dir => {
    const uploadPath = join(process.cwd(), dir);
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
  });
  
  // Serve static files
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
  
  // Global exception filter for standardized error responses
  app.useGlobalFilters(new HttpExceptionFilter());
  
  // Global interceptor for standardized success responses
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  // Enable validation globally
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Remove unknown properties
    forbidNonWhitelisted: true, // Throw error for unknown properties
    transform: true, // Transform payloads to DTO instances
  }));
  
  // Enable CORS
  app.enableCors();
  
  // Set global prefix for all routes
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
}
bootstrap();
