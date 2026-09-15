import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountsFacade } from '../accounts/accounts.facade';
import { TransactionsFacade } from '../transactions/transactions.facade';
import { CategoriesFacade } from '../categories/categories.facade';
import { ADJUSTMENT_CATEGORY_KEY } from './domain/adjustment-category';
import { ReconcileAccountDto } from './dto/reconcile.dto';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsFacade: AccountsFacade,
    private readonly transactionsFacade: TransactionsFacade,
    private readonly categoriesFacade: CategoriesFacade,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * RG-A8/RG-A9/RG-A12/RG-A13 (docs/04 §B): the user declares an account's actual balance at a
   * date — the server computes the delta itself and books it as one ordinary ADJUSTMENT
   * transaction (audited, editable, reversible), typed EXPENSE/INCOME by sign. A zero delta
   * still records `lastReconciledAt` (the user did perform the check) but creates nothing else.
   */
  async reconcile(userId: string, accountId: string, dto: ReconcileAccountDto) {
    const account = await this.accountsFacade.getById(userId, accountId);
    const actualBalanceMinor = BigInt(dto.actualBalanceMinor);
    const deltaMinor = actualBalanceMinor - account.currentBalanceMinor;

    let transaction: Awaited<ReturnType<TransactionsFacade['createFromReconciliation']>> | null = null;
    if (deltaMinor !== 0n) {
      const category = await this.categoriesFacade.findSystemByKey(userId, ADJUSTMENT_CATEGORY_KEY);
      transaction = await this.transactionsFacade.createFromReconciliation(userId, {
        accountId,
        type: deltaMinor > 0n ? 'INCOME' : 'EXPENSE',
        amountMinor: (deltaMinor > 0n ? deltaMinor : -deltaMinor).toString(),
        occurredAt: dto.asOfDate,
        description: account.name,
        categoryId: category.id,
        status: 'RECONCILED',
        tagIds: [],
      });
    }

    await this.accountsFacade.updateLastReconciledAt(userId, accountId, new Date());
    return { deltaMinor: deltaMinor.toString(), transaction };
  }

  /**
   * RG-A11 (docs/03 §16, docs/04 §B): the nightly internal drift check — stored vs. recomputed
   * balance. Log-and-notify only; deliberately never calls TransactionsFacade, so it can never
   * create an adjustment on the user's behalf.
   *
   * `onlyUserId` is a test-only seam: tests run against the real shared dev database
   * (docs/10-conventions-dev.md §6), and this job otherwise sweeps every user's accounts with no
   * scoping — unsafe to invoke unscoped from a test after this session's DB-wipe incident (see the
   * plan file). The real `@Cron` entry point always omits it.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runNightlyDriftChecks(onlyUserId?: string): Promise<void> {
    const accounts = await this.prisma.account.findMany({
      where: { isArchived: false, ...(onlyUserId && { userId: onlyUserId }) },
    });

    for (const account of accounts) {
      // amountMinor is stored unsigned; EXPENSE subtracts, INCOME adds (transactions module convention).
      const [expense, income] = await Promise.all([
        this.prisma.transaction.aggregate({
          where: { userId: account.userId, accountId: account.id, type: 'EXPENSE' },
          _sum: { amountMinor: true },
        }),
        this.prisma.transaction.aggregate({
          where: { userId: account.userId, accountId: account.id, type: 'INCOME' },
          _sum: { amountMinor: true },
        }),
      ]);
      const computedMinor =
        account.openingBalanceMinor + (income._sum.amountMinor ?? 0n) - (expense._sum.amountMinor ?? 0n);
      const deltaMinor = account.currentBalanceMinor - computedMinor;
      const isMatch = deltaMinor === 0n;

      await this.prisma.$transaction([
        this.prisma.balanceCheck.create({
          data: {
            userId: account.userId,
            accountId: account.id,
            storedMinor: account.currentBalanceMinor,
            computedMinor,
            deltaMinor,
            isMatch,
          },
        }),
        this.prisma.account.update({ where: { id: account.id }, data: { balanceCheckedAt: new Date() } }),
      ]);

      if (!isMatch) {
        this.events.emit('account.balance_mismatch', {
          userId: account.userId,
          accountId: account.id,
          accountName: account.name,
        });
      }
    }
  }
}
