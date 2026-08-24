import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StorageAdapter } from './storage.interface';

/**
 * Local-disk implementation of `StorageAdapter` (docs/12 Lot 13: "local disk by default,
 * S3-compatible optional via env"). No S3 SDK dependency exists in this repo yet, so only this
 * adapter is implemented for now — see docs/QUESTIONS.md. The interface lets an S3-backed
 * adapter be added later without touching callers.
 */
@Injectable()
export class LocalDiskStorageService implements StorageAdapter {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = config.get<string>('STORAGE_DIR') ?? './storage/attachments';
  }

  async save(key: string, data: Buffer): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, key), data);
  }

  read(key: string): NodeJS.ReadableStream {
    return createReadStream(join(this.root, key));
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.root, key), { force: true });
  }
}
