import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError } from '../../common/errors/app-error';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived: boolean) {
    const accounts = await this.prisma.account.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (accounts.length === 0) return accounts;

    const accountIds = accounts.map((a) => a.id);
    const grouped = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { userId, accountId: { in: accountIds } },
      _sum: { amountMinor: true },
    });
    const totalsByAccount = new Map<string, { entriesMinor: bigint; exitsMinor: bigint }>();
    for (const row of grouped) {
      const totals = totalsByAccount.get(row.accountId) ?? { entriesMinor: 0n, exitsMinor: 0n };
      if (row.type === 'INCOME') totals.entriesMinor += row._sum.amountMinor ?? 0n;
      if (row.type === 'EXPENSE') totals.exitsMinor += row._sum.amountMinor ?? 0n;
      totalsByAccount.set(row.accountId, totals);
    }

    return accounts.map((account) => {
      const totals = totalsByAccount.get(account.id) ?? { entriesMinor: 0n, exitsMinor: 0n };
      return { ...account, entriesMinor: totals.entriesMinor, exitsMinor: totals.exitsMinor };
    });
  }

  async getById(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!account) {
      // Another user's account also 404s here — same code path, no enumeration (docs/05 §1).
      throw new NotFoundAppError('ACCOUNT_NOT_FOUND');
    }
    return account;
  }

  async create(userId: string, dto: CreateAccountDto) {
    if (dto.id) {
      // RG-SY3: an id already used by this user is a replay, not an error.
      const existing = await this.prisma.account.findFirst({ where: { userId, id: dto.id } });
      if (existing) return existing;
    }

    const currency = await this.prisma.currency.findUnique({ where: { code: dto.currency } });
    if (!currency) {
      throw new NotFoundAppError('CURRENCY_NOT_FOUND', { code: dto.currency });
    }

    const openingBalanceMinor = BigInt(dto.openingBalanceMinor);
    return this.prisma.account.create({
      data: {
        id: dto.id,
        userId,
        name: dto.name,
        type: dto.type,
        currency: dto.currency,
        openingBalanceMinor,
        openingBalanceAt: dto.openingBalanceAt,
        currentBalanceMinor: openingBalanceMinor,
        creditLimitMinor: dto.creditLimitMinor ? BigInt(dto.creditLimitMinor) : null,
        institution: dto.institution,
        color: dto.color,
        icon: dto.icon,
        includeInNetWorth: dto.includeInNetWorth,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.getById(userId, id);
    return this.prisma.account.update({
      where: { id },
      data: {
        ...dto,
        creditLimitMinor: dto.creditLimitMinor !== undefined ? BigInt(dto.creditLimitMinor) : undefined,
      },
    });
  }

  /** Refused if the account still has transactions (docs/05 §4). */
  async remove(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    const usedCount = await this.prisma.transaction.count({ where: { userId, accountId: id } });
    if (usedCount > 0) {
      throw new ConflictAppError('ACCOUNT_HAS_TRANSACTIONS', { usedCount });
    }
    await this.prisma.account.delete({ where: { id } });
  }

  /** Called by `transactions` (docs/02 §5) to keep `currentBalanceMinor` incrementally maintained. */
  adjustBalance(id: string, deltaMinor: bigint, tx: Prisma.TransactionClient = this.prisma) {
    return tx.account.update({ where: { id }, data: { currentBalanceMinor: { increment: deltaMinor } } });
  }

  async archive(userId: string, id: string) {
    await this.getById(userId, id);
    return this.prisma.account.update({ where: { id }, data: { isArchived: true } });
  }

  async unarchive(userId: string, id: string) {
    await this.getById(userId, id);
    return this.prisma.account.update({ where: { id }, data: { isArchived: false } });
  }

  /** RG-A12 (docs/04 §B, lot 19): set only by an explicit user reconciliation — see the `reconciliation` module. */
  async updateLastReconciledAt(userId: string, id: string, at: Date) {
    await this.getById(userId, id);
    return this.prisma.account.update({ where: { id }, data: { lastReconciledAt: at } });
  }
}
