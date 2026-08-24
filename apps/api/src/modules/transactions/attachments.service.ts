import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundAppError, ValidationAppError } from '../../common/errors/app-error';
import { STORAGE_ADAPTER, StorageAdapter } from '../../common/storage/storage.interface';
import { TransactionsService } from './transactions.service';

// docs/12 Lot 13: conservative default — receipt photos only, no spec-pinned list to follow.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async list(userId: string, transactionId: string) {
    await this.transactions.getById(userId, transactionId);
    return this.prisma.attachment.findMany({
      where: { userId, transactionId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(userId: string, transactionId: string, file: Express.Multer.File) {
    await this.transactions.getById(userId, transactionId);
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new ValidationAppError('ATTACHMENT_MIME_NOT_ALLOWED');
    }
    const storageKey = randomUUID();
    await this.storage.save(storageKey, file.buffer);
    return this.prisma.attachment.create({
      data: {
        userId,
        transactionId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }

  async getById(userId: string, transactionId: string, id: string) {
    const found = await this.prisma.attachment.findFirst({ where: { id, userId, transactionId, deletedAt: null } });
    if (!found) {
      throw new NotFoundAppError('ATTACHMENT_NOT_FOUND');
    }
    return found;
  }

  async streamFile(userId: string, transactionId: string, id: string) {
    const attachment = await this.getById(userId, transactionId, id);
    return {
      stream: this.storage.read(attachment.storageKey),
      mimeType: attachment.mimeType,
      originalName: attachment.originalName,
    };
  }

  async remove(userId: string, transactionId: string, id: string): Promise<void> {
    const attachment = await this.getById(userId, transactionId, id);
    await this.storage.delete(attachment.storageKey);
    await this.prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date() } });
  }
}
