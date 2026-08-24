import { Global, Module } from '@nestjs/common';
import { STORAGE_ADAPTER } from './storage.interface';
import { LocalDiskStorageService } from './local-disk-storage.service';

@Global()
@Module({
  providers: [{ provide: STORAGE_ADAPTER, useClass: LocalDiskStorageService }],
  exports: [STORAGE_ADAPTER],
})
export class StorageModule {}
