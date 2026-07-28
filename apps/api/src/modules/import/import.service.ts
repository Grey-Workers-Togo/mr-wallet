import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError, ValidationAppError } from '../../common/errors/app-error';
import { AccountsFacade } from '../accounts/accounts.facade';
import { TransactionsFacade } from '../transactions/transactions.facade';
import { computeFingerprint, normalizeLabel } from '../transactions/domain/normalize';
import { findProbableDuplicate } from './domain/dedupe';
import { MappedRow, RowMappingError, mapRow } from './domain/map-row';
import { parseDelimitedText, parseSpreadsheet } from './domain/parse-file';
import { CreateImportSourceDto, UploadImportDto } from './dto/import.dto';

export interface PreviewRow {
  rowIndex: number;
  candidate: MappedRow;
  fingerprint: string;
  normalizedLabel: string;
}

export interface DuplicateRow extends PreviewRow {
  matchedTransactionId: string;
  matchType: 'EXACT' | 'PROBABLE';
}

export interface ErrorRow {
  rowIndex: number;
  column: string;
  raw: string;
  message: string;
}

interface StagedBatch {
  userId: string;
  accountId: string;
  currency: string;
  toImport: PreviewRow[];
  duplicates: DuplicateRow[];
  errors: ErrorRow[];
}

/**
 * docs/06 §1: preview data (steps 1-7) is kept in memory, keyed by batch id, until commit —
 * no schema table exists for staged rows. Known MVP limitation: lost on process restart, no
 * 30-day raw-file retention/purge job, upload is always synchronous (no >1000-row async queue).
 */
@Injectable()
export class ImportService {
  private readonly stagedBatches = new Map<string, StagedBatch>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsFacade: AccountsFacade,
    private readonly transactionsFacade: TransactionsFacade,
  ) {}

  listSources(userId: string) {
    return this.prisma.importSource.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  createSource(userId: string, dto: CreateImportSourceDto) {
    return this.prisma.importSource.create({ data: { userId, ...dto } });
  }

  async updateSource(userId: string, id: string, dto: Partial<CreateImportSourceDto>) {
    const existing = await this.prisma.importSource.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundAppError('IMPORT_SOURCE_NOT_FOUND');
    return this.prisma.importSource.update({ where: { id }, data: dto });
  }

  async removeSource(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.importSource.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundAppError('IMPORT_SOURCE_NOT_FOUND');
    await this.prisma.importSource.delete({ where: { id } });
  }

  listBatches(userId: string) {
    return this.prisma.importBatch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async getBatch(userId: string, id: string) {
    const batch = await this.prisma.importBatch.findFirst({ where: { id, userId } });
    if (!batch) throw new NotFoundAppError('IMPORT_BATCH_NOT_FOUND');
    return batch;
  }

  async upload(userId: string, file: Express.Multer.File, dto: UploadImportDto) {
    const account = await this.accountsFacade.getById(userId, dto.accountId);
    const currency = await this.prisma.currency.findUnique({ where: { code: account.currency } });
    if (!currency) throw new NotFoundAppError('CURRENCY_NOT_FOUND', { code: account.currency });

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    if (!dto.force) {
      // docs/06 §2: same file already imported for this user → 409, unless the caller forces it.
      const previous = await this.prisma.importBatch.findFirst({
        where: { userId, fileHash, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
      });
      if (previous) {
        throw new ConflictAppError('IMPORT_FILE_ALREADY_IMPORTED', { previousBatchId: previous.id, importedAt: previous.completedAt });
      }
    }

    const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.originalname);
    const parsed = isSpreadsheet ? await parseSpreadsheet(file.buffer) : parseDelimitedText(file.buffer);
    if (parsed.headers.length === 0) {
      throw new ValidationAppError('IMPORT_FILE_EMPTY_OR_UNPARSEABLE');
    }

    const existingForDedupe = await this.transactionsFacade.listForDedupe(userId, [dto.accountId]);
    const existingFingerprints = new Map(existingForDedupe.map((t) => [t.fingerprint, t]));
    const seenInBatch = new Set<string>();

    const toImport: PreviewRow[] = [];
    const duplicates: DuplicateRow[] = [];
    const errors: ErrorRow[] = [];

    parsed.rows.forEach((row, index) => {
      const rowIndex = parsed.headerRowIndex + 1 + index;
      if (row.every((c) => !c || c.trim() === '')) return;

      let candidate: MappedRow;
      try {
        candidate = mapRow(
          parsed.headers,
          row,
          dto.mapping,
          dto.amountStrategy,
          dto.dateFormat,
          dto.decimalSeparator,
          dto.thousandSeparator,
          currency.minorUnits,
        );
      } catch (error) {
        if (error instanceof RowMappingError) {
          errors.push({ rowIndex, column: error.column, raw: error.raw, message: error.message });
          return;
        }
        throw error;
      }

      const normalized = normalizeLabel(candidate.description);
      const fingerprint = computeFingerprint({
        accountId: dto.accountId,
        occurredAt: candidate.occurredAt,
        type: candidate.type,
        amountMinor: candidate.amountMinor,
        normalizedLabel: normalized,
      });

      const previewRow: PreviewRow = { rowIndex, candidate, fingerprint, normalizedLabel: normalized };

      // docs/06 §7 level 2: exact fingerprint match, existing DB or already seen earlier in this file.
      const exactMatch = existingFingerprints.get(fingerprint);
      if (exactMatch || seenInBatch.has(fingerprint)) {
        duplicates.push({ ...previewRow, matchedTransactionId: exactMatch?.id ?? 'in-batch', matchType: 'EXACT' });
        return;
      }
      seenInBatch.add(fingerprint);

      // docs/06 §7 level 3: probable duplicate — same account/amount, date ±3d, label similarity ≥ 0.85.
      const probable = findProbableDuplicate(
        { accountId: dto.accountId, amountMinor: candidate.amountMinor, occurredAt: candidate.occurredAt, normalizedLabel: normalized },
        existingForDedupe,
      );
      if (probable) {
        duplicates.push({ ...previewRow, matchedTransactionId: probable.id, matchType: 'PROBABLE' });
        return;
      }

      toImport.push(previewRow);
    });

    const batch = await this.prisma.importBatch.create({
      data: {
        userId,
        accountId: dto.accountId,
        fileName: file.originalname,
        fileHash,
        fileSizeBytes: file.size,
        status: 'AWAITING_REVIEW',
        totalRows: parsed.rows.length,
        duplicateRows: duplicates.length,
        errorRows: errors.length,
      },
    });

    this.stagedBatches.set(batch.id, { userId, accountId: dto.accountId, currency: account.currency, toImport, duplicates, errors });

    return { batch, toImport, duplicates, errors };
  }

  async preview(userId: string, batchId: string) {
    await this.getBatch(userId, batchId);
    const staged = this.stagedBatches.get(batchId);
    if (!staged) {
      throw new ConflictAppError('IMPORT_PREVIEW_EXPIRED');
    }
    return staged;
  }

  /** docs/06 §9: writes go through the `transactions` facade only — one Transaction per accepted row. */
  async commit(userId: string, batchId: string, excludeRowIndexes: number[]) {
    const batch = await this.getBatch(userId, batchId);
    const staged = this.stagedBatches.get(batchId);
    if (!staged) {
      throw new ConflictAppError('IMPORT_PREVIEW_EXPIRED');
    }

    const excluded = new Set(excludeRowIndexes);
    const rowsToCommit = staged.toImport.filter((row) => !excluded.has(row.rowIndex));

    let importedRows = 0;
    for (const row of rowsToCommit) {
      await this.transactionsFacade.createFromImport(
        userId,
        {
          accountId: staged.accountId,
          type: row.candidate.type,
          amountMinor: row.candidate.amountMinor.toString(),
          occurredAt: row.candidate.occurredAt,
          description: row.candidate.description,
          payee: row.candidate.payee,
          notes: row.candidate.notes,
          status: 'CLEARED',
          tagIds: [],
        },
        batchId,
        row.candidate.externalRef,
      );
      importedRows += 1;
    }

    const updated = await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: 'COMPLETED',
        importedRows,
        duplicateRows: staged.duplicates.length,
        errorRows: staged.errors.length,
        completedAt: new Date(),
      },
    });

    this.stagedBatches.delete(batchId);
    return updated;
  }

  /** docs/06 §9: refused if a transaction from the batch was edited manually since the commit. */
  async revert(userId: string, batchId: string) {
    const batch = await this.getBatch(userId, batchId);
    if (batch.status !== 'COMPLETED') {
      throw new ConflictAppError('IMPORT_BATCH_NOT_REVERTIBLE');
    }

    const transactions = await this.transactionsFacade.listByImportBatch(userId, batchId);
    const modified = transactions.filter((t) => batch.completedAt && t.updatedAt > batch.completedAt);
    if (modified.length > 0) {
      throw new ConflictAppError('IMPORT_BATCH_HAS_MODIFIED_TRANSACTIONS', { transactionIds: modified.map((t) => t.id) });
    }

    for (const transaction of transactions) {
      await this.transactionsFacade.remove(userId, transaction.id);
    }

    return this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'REVERTED', revertedAt: new Date() },
    });
  }
}
