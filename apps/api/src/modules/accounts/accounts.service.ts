import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../common/errors/app-error';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, includeArchived: boolean) {
    return this.prisma.account.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
    const currency = await this.prisma.currency.findUnique({ where: { code: dto.currency } });
    if (!currency) {
      throw new NotFoundAppError('CURRENCY_NOT_FOUND', { code: dto.currency });
    }

    const openingBalanceMinor = BigInt(dto.openingBalanceMinor);
    return this.prisma.account.create({
      data: {
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

  /** Refused if the account still has transactions (docs/05 §4) — enforced once `transactions` exists (Lot 2). */
  async remove(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.prisma.account.delete({ where: { id } });
  }

  async archive(userId: string, id: string) {
    await this.getById(userId, id);
    return this.prisma.account.update({ where: { id }, data: { isArchived: true } });
  }

  async unarchive(userId: string, id: string) {
    await this.getById(userId, id);
    return this.prisma.account.update({ where: { id }, data: { isArchived: false } });
  }

  /**
   * Compares the stored balance against opening balance + Σ transactions and records the
   * result in `BalanceCheck` (docs/03 §16). With no `transactions` module yet (Lot 2), the
   * computed balance is simply the opening balance — the nightly scheduled task lands in Lot 2.
   */
  async reconcile(userId: string, id: string) {
    const account = await this.getById(userId, id);
    const computedMinor = account.openingBalanceMinor;
    const deltaMinor = account.currentBalanceMinor - computedMinor;
    const isMatch = deltaMinor === 0n;

    // Always returns the discrepancy (docs/05-api.md §4) — never corrects it silently (docs/03 §16).
    return this.prisma.balanceCheck.create({
      data: {
        userId,
        accountId: id,
        storedMinor: account.currentBalanceMinor,
        computedMinor,
        deltaMinor,
        isMatch,
      },
    });
  }
}
