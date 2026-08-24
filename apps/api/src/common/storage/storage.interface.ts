export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): NodeJS.ReadableStream;
  delete(key: string): Promise<void>;
}

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');
