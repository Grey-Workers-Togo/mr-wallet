import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotFoundAppError, ValidationAppError } from '../../../common/errors/app-error';
import { AccountsService } from '../../accounts/accounts.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { CategoriesService } from '../../categories/categories.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { RulesService } from '../../rules/rules.service';
import { RulesFacade } from '../../rules/rules.facade';
import { TransactionsService } from '../transactions.service';
import { SavedSearchesService } from '../saved-searches.service';
import { AttachmentsService } from '../attachments.service';
import { LocalDiskStorageService } from '../../../common/storage/local-disk-storage.service';

const TEST_STORAGE_DIR = join(__dirname, '.tmp-attachments');

function buildServices(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const savedSearches = new SavedSearchesService(prisma);
  const transactions = new TransactionsService(
    prisma,
    accountsFacade,
    categoriesFacade,
    rulesFacade,
    new EventEmitter2(),
    savedSearches,
  );
  const storage = new LocalDiskStorageService({ get: () => TEST_STORAGE_DIR } as never);
  const attachments = new AttachmentsService(prisma, transactions, storage);
  return { transactions, attachments };
}

function fakeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-jpeg-bytes'),
    mimetype: 'image/jpeg',
    originalname: 'receipt.jpg',
    size: 15,
    fieldname: 'file',
    encoding: '7bit',
    ...overrides,
  } as Express.Multer.File;
}

describe('attachments: receipt photo on a transaction', () => {
  const prisma = new PrismaService();
  const accountsService = new AccountsService(prisma);
  const { transactions, attachments } = buildServices(prisma);

  let userId: string;
  let otherUserId: string;
  let accountId: string;
  let transactionId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `attach-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;
    const other = await prisma.user.create({
      data: { email: `attach-other-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    otherUserId = other.id;

    const account = await accountsService.create(userId, {
      name: 'Main',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;

    const tx = await transactions.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '2500',
      occurredAt: new Date('2026-03-05'),
      description: 'Groceries',
      status: 'CLEARED',
      tagIds: [],
    });
    transactionId = tx.id;
  });

  beforeEach(async () => {
    await prisma.attachment.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  });

  it('uploads a receipt photo, retrieves it, then deletes it and removes the underlying file', async () => {
    const attachment = await attachments.upload(userId, transactionId, fakeFile());
    const filePath = join(TEST_STORAGE_DIR, attachment.storageKey);
    expect(existsSync(filePath)).toBe(true);

    const { mimeType, originalName } = await attachments.streamFile(userId, transactionId, attachment.id);
    expect(mimeType).toBe('image/jpeg');
    expect(originalName).toBe('receipt.jpg');

    await attachments.remove(userId, transactionId, attachment.id);
    expect(existsSync(filePath)).toBe(false);
    await expect(attachments.getById(userId, transactionId, attachment.id)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('rejects a disallowed mime type', async () => {
    await expect(
      attachments.upload(userId, transactionId, fakeFile({ mimetype: 'application/pdf' })),
    ).rejects.toBeInstanceOf(ValidationAppError);
  });

  it('a deleted attachment no longer appears in the list', async () => {
    const attachment = await attachments.upload(userId, transactionId, fakeFile());
    await attachments.remove(userId, transactionId, attachment.id);
    const list = await attachments.list(userId, transactionId);
    expect(list.find((a) => a.id === attachment.id)).toBeUndefined();
  });

  it('user A cannot read, stream, or delete user B attachment, even by guessing the id', async () => {
    const attachment = await attachments.upload(userId, transactionId, fakeFile());
    await expect(attachments.getById(otherUserId, transactionId, attachment.id)).rejects.toBeInstanceOf(
      NotFoundAppError,
    );
    await expect(attachments.streamFile(otherUserId, transactionId, attachment.id)).rejects.toBeInstanceOf(
      NotFoundAppError,
    );
    await expect(attachments.remove(otherUserId, transactionId, attachment.id)).rejects.toBeInstanceOf(
      NotFoundAppError,
    );
    // The file must still exist — user B's failed delete attempt must not have removed it.
    const filePath = join(TEST_STORAGE_DIR, attachment.storageKey);
    expect(existsSync(filePath)).toBe(true);
  });

  it('user B cannot list or upload against user A transaction', async () => {
    await expect(attachments.list(otherUserId, transactionId)).rejects.toBeInstanceOf(NotFoundAppError);
    await expect(attachments.upload(otherUserId, transactionId, fakeFile())).rejects.toBeInstanceOf(
      NotFoundAppError,
    );
  });
});
