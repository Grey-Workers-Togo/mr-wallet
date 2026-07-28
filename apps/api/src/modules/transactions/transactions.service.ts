import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError, ValidationAppError } from '../../common/errors/app-error';
import { AccountsFacade } from '../accounts/accounts.facade';
import { CategoriesFacade } from '../categories/categories.facade';
import { RulesFacade } from '../rules/rules.facade';
import { balanceDelta } from './domain/balance-delta';
import { computeFingerprint, normalizeLabel } from './domain/normalize';
import {
  BulkIdsDto,
  BulkUpdateDto,
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

const ONE_YEAR_MS = 366 * 24 * 60 * 60 * 1000;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsFacade: AccountsFacade,
    private readonly categoriesFacade: CategoriesFacade,
    private readonly rulesFacade: RulesFacade,
    private readonly events: EventEmitter2,
  ) {}

  /** No Prisma relation on `TransactionTag` (schema uses flat FK columns) — joined manually. */
  private async attachTags<T extends { id: string }>(transactions: T[]): Promise<(T & { tagIds: string[] })[]> {
    if (transactions.length === 0) return [];
    const links = await this.prisma.transactionTag.findMany({
      where: { transactionId: { in: transactions.map((t) => t.id) } },
    });
    const byTransaction = new Map<string, string[]>();
    for (const link of links) {
      byTransaction.set(link.transactionId, [...(byTransaction.get(link.transactionId) ?? []), link.tagId]);
    }
    return transactions.map((t) => ({ ...t, tagIds: byTransaction.get(t.id) ?? [] }));
  }

  private async attachTagsOne<T extends { id: string }>(transaction: T): Promise<T & { tagIds: string[] }> {
    const [withTags] = await this.attachTags([transaction]);
    return withTags as T & { tagIds: string[] };
  }

  async list(userId: string, query: ListTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...((query.from || query.to) && {
        occurredAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...((query.minAmountMinor || query.maxAmountMinor) && {
        amountMinor: {
          ...(query.minAmountMinor && { gte: BigInt(query.minAmountMinor) }),
          ...(query.maxAmountMinor && { lte: BigInt(query.maxAmountMinor) }),
        },
      }),
    };

    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasMore = items.length > query.limit;
    const page = hasMore ? items.slice(0, query.limit) : items;
    return { items: await this.attachTags(page), nextCursor: hasMore ? page[page.length - 1]?.id : null };
  }

  /** docs/06 §10: unbounded (no cursor pagination) — used by `export`, never by an HTTP list endpoint. */
  async listAllForExport(userId: string, filters: { accountId?: string; from?: Date; to?: Date }) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(filters.accountId && { accountId: filters.accountId }),
      ...((filters.from || filters.to) && {
        occurredAt: { ...(filters.from && { gte: filters.from }), ...(filters.to && { lte: filters.to }) },
      }),
    };
    const items = await this.prisma.transaction.findMany({ where, orderBy: [{ occurredAt: 'desc' }] });
    return this.attachTags(items);
  }

  async getById(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!transaction) {
      throw new NotFoundAppError('TRANSACTION_NOT_FOUND');
    }
    return this.attachTagsOne(transaction);
  }

  private async validateAgainstAccount(userId: string, accountId: string, amountMinor: bigint, occurredAt: Date) {
    if (amountMinor <= 0n) {
      // RG-T1
      throw new ValidationAppError('TRANSACTION_AMOUNT_MUST_BE_POSITIVE');
    }
    const account = await this.accountsFacade.getById(userId, accountId);
    if (occurredAt < account.openingBalanceAt) {
      // RG-T3
      throw new ValidationAppError('TRANSACTION_DATE_BEFORE_OPENING_BALANCE');
    }
    if (occurredAt.getTime() > Date.now() + ONE_YEAR_MS) {
      // RG-T3
      throw new ValidationAppError('TRANSACTION_DATE_TOO_FAR_IN_FUTURE');
    }
    return account;
  }

  async create(
    userId: string,
    dto: CreateTransactionDto,
    opts?: {
      source?: 'MANUAL' | 'IMPORT' | 'RECURRENCE' | 'DEBT_PAYMENT';
      importBatchId?: string;
      externalRef?: string;
      recurrenceId?: string;
      debtPaymentId?: string;
    },
  ) {
    const amountMinor = BigInt(dto.amountMinor);
    const account = await this.validateAgainstAccount(userId, dto.accountId, amountMinor, dto.occurredAt);

    if (dto.categoryId) {
      const category = await this.categoriesFacade.getById(userId, dto.categoryId);
      if (category.kind !== dto.type) {
        throw new ValidationAppError('CATEGORY_KIND_MISMATCH');
      }
    }

    const normalizedLabel = normalizeLabel(dto.description);
    const fingerprint = computeFingerprint({
      accountId: dto.accountId,
      occurredAt: dto.occurredAt,
      type: dto.type,
      amountMinor,
      normalizedLabel,
    });

    // RG-T8: rules only apply when the caller did not already choose a category.
    let categoryId = dto.categoryId;
    let payee = dto.payee;
    let tagIds = dto.tagIds;
    let matchedRuleId: string | null = null;
    if (!categoryId) {
      const rule = await this.rulesFacade.findMatch(userId, {
        accountId: dto.accountId,
        amountMinor,
        description: dto.description,
        payee: dto.payee ?? null,
        externalRef: opts?.externalRef ?? null,
      });
      if (rule) {
        categoryId = rule.categoryId;
        payee = rule.setPayee ?? payee;
        tagIds = [...new Set([...tagIds, ...rule.addTagIds])];
        matchedRuleId = rule.id;
      }
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          userId,
          accountId: dto.accountId,
          type: dto.type,
          amountMinor,
          currency: account.currency,
          occurredAt: dto.occurredAt,
          description: dto.description,
          normalizedLabel,
          categoryId,
          payee,
          notes: dto.notes,
          status: dto.status,
          fingerprint,
          source: opts?.source ?? 'MANUAL',
          importBatchId: opts?.importBatchId,
          externalRef: opts?.externalRef,
          recurrenceId: opts?.recurrenceId,
          debtPaymentId: opts?.debtPaymentId,
        },
      });
      if (tagIds.length > 0) {
        await tx.transactionTag.createMany({
          data: tagIds.map((tagId) => ({ transactionId: created.id, tagId })),
        });
      }
      await this.accountsFacade.adjustBalance(dto.accountId, balanceDelta(dto.type, amountMinor), tx);
      return created;
    });

    if (matchedRuleId) {
      await this.rulesFacade.incrementTimesApplied(matchedRuleId);
    }
    await this.events.emitAsync('transaction.created', { userId, transaction });
    return this.attachTagsOne(transaction);
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.getById(userId, id);
    if (existing.transferGroupId) {
      // RG-T4: transfer legs are edited as a pair — use a dedicated flow, not the plain update.
      throw new ConflictAppError('TRANSACTION_IS_TRANSFER_LEG');
    }
    if (existing.source === 'DEBT_PAYMENT') {
      // RG-T10
      throw new ConflictAppError('TRANSACTION_LINKED_TO_DEBT_PAYMENT');
    }

    const nextAccountId = dto.accountId ?? existing.accountId;
    const nextAmountMinor = dto.amountMinor !== undefined ? BigInt(dto.amountMinor) : existing.amountMinor;
    const nextOccurredAt = dto.occurredAt ?? existing.occurredAt;
    const account = await this.validateAgainstAccount(userId, nextAccountId, nextAmountMinor, nextOccurredAt);

    if (dto.categoryId) {
      const category = await this.categoriesFacade.getById(userId, dto.categoryId);
      if (category.kind !== existing.type) {
        throw new ValidationAppError('CATEGORY_KIND_MISMATCH');
      }
    }

    const nextDescription = dto.description ?? existing.description;
    const normalizedLabel = normalizeLabel(nextDescription);
    const fingerprint = computeFingerprint({
      accountId: nextAccountId,
      occurredAt: nextOccurredAt,
      type: existing.type,
      amountMinor: nextAmountMinor,
      normalizedLabel,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      // Reverse the old balance effect, then apply the new one — same account or not.
      await this.accountsFacade.adjustBalance(
        existing.accountId,
        -balanceDelta(existing.type, existing.amountMinor),
        tx,
      );
      await this.accountsFacade.adjustBalance(nextAccountId, balanceDelta(existing.type, nextAmountMinor), tx);

      if (dto.tagIds) {
        await tx.transactionTag.deleteMany({ where: { transactionId: id } });
        if (dto.tagIds.length > 0) {
          await tx.transactionTag.createMany({ data: dto.tagIds.map((tagId) => ({ transactionId: id, tagId })) });
        }
      }

      return tx.transaction.update({
        where: { id },
        data: {
          accountId: nextAccountId,
          amountMinor: nextAmountMinor,
          currency: account.currency,
          occurredAt: nextOccurredAt,
          description: nextDescription,
          normalizedLabel,
          categoryId: dto.categoryId === null ? null : (dto.categoryId ?? existing.categoryId),
          payee: dto.payee ?? existing.payee,
          notes: dto.notes ?? existing.notes,
          status: dto.status ?? existing.status,
          fingerprint,
        },
      });
    });

    // RG-T9
    await this.events.emitAsync('transaction.updated', { userId, before: existing, after: updated });
    return this.attachTagsOne(updated);
  }

  async remove(userId: string, id: string, opts?: { allowDebtPayment?: boolean }): Promise<void> {
    const existing = await this.getById(userId, id);
    if (existing.source === 'DEBT_PAYMENT' && !opts?.allowDebtPayment) {
      // RG-T10
      throw new ConflictAppError('TRANSACTION_LINKED_TO_DEBT_PAYMENT');
    }

    if (existing.transferGroupId) {
      await this.removeTransferGroup(userId, existing.transferGroupId);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.accountsFacade.adjustBalance(
        existing.accountId,
        -balanceDelta(existing.type, existing.amountMinor),
        tx,
      );
      await tx.transactionTag.deleteMany({ where: { transactionId: id } });
      await tx.transaction.delete({ where: { id } });
    });
    await this.events.emitAsync('transaction.deleted', { userId, transaction: existing });
  }

  private async removeTransferGroup(userId: string, transferGroupId: string): Promise<void> {
    const legs = await this.prisma.transaction.findMany({ where: { userId, transferGroupId } });
    await this.prisma.$transaction(async (tx) => {
      for (const leg of legs) {
        await this.accountsFacade.adjustBalance(leg.accountId, -balanceDelta(leg.type, leg.amountMinor), tx);
        await tx.transactionTag.deleteMany({ where: { transactionId: leg.id } });
      }
      await tx.transaction.deleteMany({ where: { transferGroupId } });
    });
    for (const leg of legs) {
      await this.events.emitAsync('transaction.deleted', { userId, transaction: leg });
    }
  }

  /** RG-T4: two legs sharing a `transferGroupId`, excluded from spend/income totals (RG-T5). */
  async transfer(userId: string, dto: CreateTransferDto) {
    const amountMinor = BigInt(dto.amountMinor);
    const fromAccount = await this.validateAgainstAccount(userId, dto.fromAccountId, amountMinor, dto.occurredAt);
    const toAccount = await this.validateAgainstAccount(userId, dto.toAccountId, amountMinor, dto.occurredAt);

    const transferGroupId = randomUUID();
    const normalizedLabel = normalizeLabel(dto.description);

    const [fromLeg, toLeg] = await this.prisma.$transaction(async (tx) => {
      const outLeg = await tx.transaction.create({
        data: {
          userId,
          accountId: dto.fromAccountId,
          type: 'EXPENSE',
          amountMinor,
          currency: fromAccount.currency,
          occurredAt: dto.occurredAt,
          description: dto.description,
          normalizedLabel,
          notes: dto.notes,
          transferGroupId,
          counterAccountId: dto.toAccountId,
          fingerprint: computeFingerprint({
            accountId: dto.fromAccountId,
            occurredAt: dto.occurredAt,
            type: 'EXPENSE',
            amountMinor,
            normalizedLabel,
          }),
        },
      });
      const inLeg = await tx.transaction.create({
        data: {
          userId,
          accountId: dto.toAccountId,
          type: 'INCOME',
          amountMinor,
          currency: toAccount.currency,
          occurredAt: dto.occurredAt,
          description: dto.description,
          normalizedLabel,
          notes: dto.notes,
          transferGroupId,
          counterAccountId: dto.fromAccountId,
          fingerprint: computeFingerprint({
            accountId: dto.toAccountId,
            occurredAt: dto.occurredAt,
            type: 'INCOME',
            amountMinor,
            normalizedLabel,
          }),
        },
      });
      await this.accountsFacade.adjustBalance(dto.fromAccountId, -amountMinor, tx);
      await this.accountsFacade.adjustBalance(dto.toAccountId, amountMinor, tx);
      return [outLeg, inLeg];
    });

    await this.events.emitAsync('transaction.created', { userId, transaction: fromLeg });
    await this.events.emitAsync('transaction.created', { userId, transaction: toLeg });
    return { fromLeg, toLeg };
  }

  async bulkDelete(userId: string, dto: BulkIdsDto): Promise<{ deletedCount: number }> {
    let deletedCount = 0;
    for (const id of dto.ids) {
      await this.remove(userId, id);
      deletedCount += 1;
    }
    return { deletedCount };
  }

  async bulkUpdate(userId: string, dto: BulkUpdateDto): Promise<{ updatedCount: number }> {
    let updatedCount = 0;
    for (const id of dto.ids) {
      await this.update(userId, id, { categoryId: dto.categoryId, status: dto.status });
      updatedCount += 1;
    }
    return { updatedCount };
  }

  /** docs/06 §7: fingerprints of existing (non-deleted) transactions for a set of accounts — level-2 dedupe. */
  async listForDedupe(userId: string, accountIds: string[]) {
    return this.prisma.transaction.findMany({
      where: { userId, accountId: { in: accountIds } },
      select: { id: true, accountId: true, amountMinor: true, occurredAt: true, normalizedLabel: true, fingerprint: true },
    });
  }

  /** docs/06 §9: transactions produced by one import batch, for the revert flow. */
  listByImportBatch(userId: string, importBatchId: string) {
    return this.prisma.transaction.findMany({ where: { userId, importBatchId } });
  }

  /** RG-T5: transfer legs (`transferGroupId` set) are excluded from spend/income totals. */
  async summary(userId: string, from?: Date, to?: Date) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      transferGroupId: null,
      ...((from || to) && { occurredAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    };
    const [expense, income] = await Promise.all([
      this.prisma.transaction.aggregate({ where: { ...where, type: 'EXPENSE' }, _sum: { amountMinor: true } }),
      this.prisma.transaction.aggregate({ where: { ...where, type: 'INCOME' }, _sum: { amountMinor: true } }),
    ]);
    return {
      totalExpenseMinor: (expense._sum.amountMinor ?? 0n).toString(),
      totalIncomeMinor: (income._sum.amountMinor ?? 0n).toString(),
    };
  }
}
