import { Global, Module } from '@nestjs/common';
import { R2StorageService } from './services/r2-storage.service';

@Global()
@Module({
  providers: [R2StorageService],
  exports: [R2StorageService],
})
export class CommonModule {}
