import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError, ValidationAppError } from '../../common/errors/app-error';
import { AccountsFacade } from '../accounts/accounts.facade';
import { TransactionsFacade } from '../transactions/transactions.facade';
import {
  AmortizationLine,
  generateAmortizationSchedule,
  generateFixedInstallmentSchedule,
  generateForRemainingCount,
  periodicRate,
} from './domain/amortization';
import { bankersRoundToBigInt } from './domain/rounding';
import { CreateDebtDto, RecordPaymentDto, RegenerateScheduleDto, SimulatePayoffDto, UpdateDebtDto } from './dto/debt.dto';

const DUE_SOON_WINDOW_DAYS = 3;

@Injectable()
export class DebtsService {
  private readonly logger = new Logger(DebtsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsFacade: AccountsFacade,
    private readonly transactionsFacade: TransactionsFacade,
    private readonly events: EventEmitter2,
  ) {}

  list(userId: string) {
    return this.prisma.debt.findMany({ where: { userId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async getById(userId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({ where: { id, userId, deletedAt: null } });
    if (!debt) throw new NotFoundAppError('DEBT_NOT_FOUND');
    return debt;
  }

  private async getInstallments(debtId: string) {
    return this.prisma.debtInstallment.findMany({ where: { debtId }, orderBy: { sequence: 'asc' } });
  }

  async create(userId: string, dto: CreateDebtDto) {
    if (dto.linkedAccountId) {
      await this.accountsFacade.getById(userId, dto.linkedAccountId);
    }
    const principalMinor = BigInt(dto.principalMinor);

    const lines = generateAmortizationSchedule({
      principalMinor,
      annualRatePct: dto.annualRatePct ?? null,
      rateType: dto.rateType,
      termMonths: dto.termMonths ?? null,
      paymentFrequency: dto.paymentFrequency,
      startedOn: dto.startedOn,
    });

    const debt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.debt.create({
        data: {
          userId,
          name: dto.name,
          direction: dto.direction,
          counterparty: dto.counterparty,
          kind: dto.kind,
          linkedAccountId: dto.linkedAccountId,
          principalMinor,
          outstandingPrincipalMinor: principalMinor,
          currency: dto.currency,
          annualRatePct: dto.annualRatePct,
          rateType: dto.rateType,
          compounding: dto.compounding,
          startedOn: dto.startedOn,
          termMonths: dto.termMonths,
          paymentFrequency: dto.paymentFrequency,
          paymentDayOfMonth: dto.paymentDayOfMonth,
          installmentMinor: lines[0]?.totalMinor,
          notes: dto.notes,
        },
      });
      if (lines.length > 0) {
        await tx.debtInstallment.createMany({
          data: lines.map((line) => ({ userId, debtId: created.id, ...this.lineToRow(line) })),
        });
      }
      return created;
    });

    return debt;
  }

  private lineToRow(line: AmortizationLine) {
    return {
      sequence: line.sequence,
      dueOn: line.dueOn,
      totalMinor: line.totalMinor,
      principalMinor: line.principalMinor,
      interestMinor: line.interestMinor,
      balanceAfterMinor: line.balanceAfterMinor,
    };
  }

  async update(userId: string, id: string, dto: UpdateDebtDto) {
    const existing = await this.getById(userId, id);
    if (dto.linkedAccountId) {
      await this.accountsFacade.getById(userId, dto.linkedAccountId);
    }
    return this.prisma.debt.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        counterparty: dto.counterparty,
        linkedAccountId: dto.linkedAccountId,
        notes: dto.notes,
        status: dto.status,
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.getById(userId, id);
    await this.prisma.debt.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }

  async schedule(userId: string, debtId: string) {
    await this.getById(userId, debtId);
    return this.getInstallments(debtId);
  }

  /** RG-D5: regeneration never touches `PAID`/`PARTIAL` installments — only replaces the future `SCHEDULED`/`LATE` ones. */
  async regenerateSchedule(userId: string, debtId: string, dto: RegenerateScheduleDto) {
    const debt = await this.getById(userId, debtId);
    const installments = await this.getInstallments(debtId);
    const settled = installments.filter((i) => i.status === 'PAID' || i.status === 'PARTIAL');
    const toReplace = installments.filter((i) => i.status === 'SCHEDULED' || i.status === 'LATE');

    if (toReplace.length === 0) return this.getInstallments(debtId);

    const startSequence = settled.length > 0 ? Math.max(...settled.map((i) => i.sequence)) + 1 : 1;
    const balance = debt.outstandingPrincipalMinor;
    const annualRatePct = debt.annualRatePct ? Number(debt.annualRatePct) : null;
    const i = periodicRate(annualRatePct, debt.rateType, debt.paymentFrequency);

    const lines =
      dto.strategy === 'REDUCE_INSTALLMENT'
        ? generateForRemainingCount(balance, annualRatePct, debt.rateType, toReplace.length, debt.paymentFrequency, new Date(), startSequence)
        : generateFixedInstallmentSchedule(
            balance,
            i,
            debt.installmentMinor ?? bankersRoundToBigInt(Number(balance) / toReplace.length),
            debt.paymentFrequency,
            new Date(),
            startSequence,
          );

    await this.prisma.$transaction(async (tx) => {
      await tx.debtInstallment.deleteMany({ where: { id: { in: toReplace.map((i2) => i2.id) } } });
      if (lines.length > 0) {
        await tx.debtInstallment.createMany({ data: lines.map((line) => ({ userId, debtId, ...this.lineToRow(line) })) });
      }
    });

    return this.getInstallments(debtId);
  }

  payments(userId: string, debtId: string) {
    return this.prisma.debtPayment.findMany({ where: { userId, debtId, deletedAt: null }, orderBy: { paidAt: 'desc' } });
  }

  /** RG-D6: fees → interest → principal. RG-D4: an extra payment goes entirely to principal. RG-D8/RG-D9. */
  async recordPayment(userId: string, debtId: string, dto: RecordPaymentDto) {
    const debt = await this.getById(userId, debtId);
    if (debt.status !== 'ACTIVE') {
      throw new ConflictAppError('DEBT_NOT_ACTIVE');
    }
    const amountMinor = BigInt(dto.amountMinor);
    if (amountMinor <= 0n) {
      throw new ValidationAppError('DEBT_PAYMENT_AMOUNT_MUST_BE_POSITIVE');
    }

    let principalMinor: bigint;
    let interestMinor: bigint;
    let feesMinor: bigint;
    let installmentId: string | null = null;

    if (dto.isExtraPayment) {
      if (amountMinor > debt.outstandingPrincipalMinor) {
        // Cas limite RG-D §"remboursement supérieur au capital restant": rejected (conservative default).
        throw new ValidationAppError('DEBT_PAYMENT_EXCEEDS_OUTSTANDING');
      }
      principalMinor = amountMinor;
      interestMinor = 0n;
      feesMinor = 0n;
    } else {
      const installment = await this.prisma.debtInstallment.findFirst({
        where: { id: dto.installmentId, userId, debtId },
      });
      if (!installment) throw new NotFoundAppError('DEBT_INSTALLMENT_NOT_FOUND');
      if (installment.status === 'PAID') throw new ConflictAppError('DEBT_INSTALLMENT_ALREADY_SETTLED');

      const priorPayments = await this.prisma.debtPayment.findMany({
        where: { installmentId: installment.id, deletedAt: null },
      });
      const paidFees = priorPayments.reduce((acc, p) => acc + p.feesMinor, 0n);
      const paidInterest = priorPayments.reduce((acc, p) => acc + p.interestMinor, 0n);
      const paidPrincipal = priorPayments.reduce((acc, p) => acc + p.principalMinor, 0n);
      const remainingFees = installment.feesMinor - paidFees;
      const remainingInterest = installment.interestMinor - paidInterest;
      const remainingPrincipal = installment.principalMinor - paidPrincipal;
      const remainingTotal = remainingFees + remainingInterest + remainingPrincipal;
      if (amountMinor > remainingTotal) {
        throw new ValidationAppError('DEBT_PAYMENT_EXCEEDS_INSTALLMENT');
      }

      let rest = amountMinor;
      feesMinor = rest < remainingFees ? rest : remainingFees;
      rest -= feesMinor;
      interestMinor = rest < remainingInterest ? rest : remainingInterest;
      rest -= interestMinor;
      principalMinor = rest < remainingPrincipal ? rest : remainingPrincipal;

      installmentId = installment.id;
      const newPaidMinor = installment.paidMinor + amountMinor;
      await this.prisma.debtInstallment.update({
        where: { id: installment.id },
        data: {
          paidMinor: newPaidMinor,
          status: newPaidMinor >= installment.totalMinor ? 'PAID' : 'PARTIAL',
          paidAt: newPaidMinor >= installment.totalMinor ? dto.paidAt : installment.paidAt,
        },
      });
    }

    const payment = await this.prisma.debtPayment.create({
      data: {
        userId,
        debtId,
        installmentId,
        paidAt: dto.paidAt,
        amountMinor,
        principalMinor,
        interestMinor,
        feesMinor,
        isExtraPayment: dto.isExtraPayment,
        notes: dto.notes,
      },
    });

    const outstandingPrincipalMinor = debt.outstandingPrincipalMinor - principalMinor;
    const paidOff = outstandingPrincipalMinor <= 0n;
    await this.prisma.debt.update({
      where: { id: debtId },
      data: {
        outstandingPrincipalMinor: paidOff ? 0n : outstandingPrincipalMinor,
        ...(paidOff && { status: 'PAID_OFF', closedAt: dto.paidAt }),
      },
    });

    if (dto.isExtraPayment && !paidOff) {
      // RG-D4: extra payment triggers regeneration of the remaining schedule (default: reduce duration).
      await this.regenerateSchedule(userId, debtId, { strategy: 'REDUCE_TERM' });
    }

    let transactionId: string | null = null;
    if (debt.linkedAccountId) {
      // RG-D9: the linked transaction is written through the transactions facade, never directly.
      const transaction = await this.transactionsFacade.createFromDebtPayment(
        userId,
        {
          accountId: debt.linkedAccountId,
          type: debt.direction === 'OWED_BY_ME' ? 'EXPENSE' : 'INCOME',
          amountMinor: amountMinor.toString(),
          occurredAt: dto.paidAt,
          description: dto.description ?? debt.name,
          notes: dto.notes,
          status: 'CLEARED',
          tagIds: [],
        },
        payment.id,
      );
      transactionId = transaction.id;
      await this.prisma.debtPayment.update({ where: { id: payment.id }, data: { transactionId } });
    }

    if (paidOff) {
      await this.events.emitAsync('debt.paid_off', { userId, debtId, debtName: debt.name });
    }

    return { ...payment, transactionId };
  }

  /** RG-D9: deleting a payment reverses the installment and debt balance, and cascades to its transaction. */
  async removePayment(userId: string, debtId: string, paymentId: string): Promise<void> {
    const payment = await this.prisma.debtPayment.findFirst({ where: { id: paymentId, userId, debtId, deletedAt: null } });
    if (!payment) throw new NotFoundAppError('DEBT_PAYMENT_NOT_FOUND');
    const debt = await this.getById(userId, debtId);

    if (payment.transactionId) {
      await this.transactionsFacade.removeDebtPaymentTransaction(userId, payment.transactionId);
    }

    if (payment.installmentId) {
      const installment = await this.prisma.debtInstallment.findUnique({ where: { id: payment.installmentId } });
      if (installment) {
        const newPaidMinor = installment.paidMinor - payment.amountMinor;
        await this.prisma.debtInstallment.update({
          where: { id: installment.id },
          data: {
            paidMinor: newPaidMinor < 0n ? 0n : newPaidMinor,
            status: newPaidMinor <= 0n ? 'SCHEDULED' : 'PARTIAL',
            paidAt: null,
          },
        });
      }
    }

    await this.prisma.debt.update({
      where: { id: debtId },
      data: {
        outstandingPrincipalMinor: debt.outstandingPrincipalMinor + payment.principalMinor,
        ...(debt.status === 'PAID_OFF' && { status: 'ACTIVE', closedAt: null }),
      },
    });

    await this.prisma.debtPayment.update({ where: { id: paymentId }, data: { deletedAt: new Date() } });
  }

  /** Pure projection — does not persist anything. */
  async simulatePayoff(userId: string, debtId: string, dto: SimulatePayoffDto) {
    const debt = await this.getById(userId, debtId);
    const scheduled = (await this.getInstallments(debtId)).filter((i) => i.status === 'SCHEDULED' || i.status === 'LATE');
    const currentInterestRemaining = scheduled.reduce((acc, i) => acc + i.interestMinor, 0n);

    const extraPaymentMinor = BigInt(dto.extraPaymentMinor);
    const newBalance = debt.outstandingPrincipalMinor - extraPaymentMinor;

    if (newBalance <= 0n) {
      return {
        payoffDate: dto.asOf ?? new Date(),
        interestSavedMinor: currentInterestRemaining.toString(),
        remainingInstallmentCount: 0,
      };
    }

    const annualRatePct = debt.annualRatePct ? Number(debt.annualRatePct) : null;
    const i = periodicRate(annualRatePct, debt.rateType, debt.paymentFrequency);
    const lines = generateFixedInstallmentSchedule(
      newBalance,
      i,
      debt.installmentMinor ?? bankersRoundToBigInt(Number(newBalance) / Math.max(1, scheduled.length)),
      debt.paymentFrequency,
      dto.asOf ?? new Date(),
      1,
    );
    const newInterestTotal = lines.reduce((acc, l) => acc + l.interestMinor, 0n);

    return {
      payoffDate: lines[lines.length - 1]?.dueOn ?? dto.asOf ?? new Date(),
      interestSavedMinor: (currentInterestRemaining - newInterestTotal).toString(),
      remainingInstallmentCount: lines.length,
    };
  }

  /** docs/04 §I: scheduled installments due before `until`, for `forecasting`. */
  async upcomingInstallments(userId: string, until: Date) {
    const installments = await this.prisma.debtInstallment.findMany({
      where: { userId, status: { in: ['SCHEDULED', 'LATE'] }, dueOn: { lte: until } },
    });
    const debts = await this.prisma.debt.findMany({ where: { userId, deletedAt: null } });
    const currencyByDebt = new Map(debts.map((d) => [d.id, d.currency]));
    return installments.map((installment) => ({
      dueOn: installment.dueOn,
      totalMinor: installment.totalMinor,
      currency: currencyByDebt.get(installment.debtId) ?? 'XOF',
    }));
  }

  /** RG-D10: `OWED_TO_ME` is an asset, `OWED_BY_ME` a liability — grouped by currency. */
  async summary(userId: string) {
    const debts = await this.prisma.debt.findMany({ where: { userId, deletedAt: null, status: 'ACTIVE' } });
    const byCurrency = new Map<string, { currency: string; owedByMeMinor: bigint; owedToMeMinor: bigint }>();
    for (const debt of debts) {
      const entry = byCurrency.get(debt.currency) ?? { currency: debt.currency, owedByMeMinor: 0n, owedToMeMinor: 0n };
      if (debt.direction === 'OWED_BY_ME') entry.owedByMeMinor += debt.outstandingPrincipalMinor;
      else entry.owedToMeMinor += debt.outstandingPrincipalMinor;
      byCurrency.set(debt.currency, entry);
    }
    return [...byCurrency.values()].map((e) => ({
      currency: e.currency,
      owedByMeMinor: e.owedByMeMinor.toString(),
      owedToMeMinor: e.owedToMeMinor.toString(),
    }));
  }

  /** RG-D7: `SCHEDULED` installments past due become `LATE`; also raises `DEBT_DUE_SOON` ahead of the deadline. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweepInstallments(): Promise<void> {
    const now = new Date();

    const overdue = await this.prisma.debtInstallment.findMany({ where: { status: 'SCHEDULED', dueOn: { lt: now } } });
    for (const installment of overdue) {
      try {
        await this.prisma.debtInstallment.update({ where: { id: installment.id }, data: { status: 'LATE' } });
        const debt = await this.prisma.debt.findUnique({ where: { id: installment.debtId } });
        if (!debt) continue;
        await this.events.emitAsync('debt.installment_overdue', {
          userId: installment.userId,
          debtId: installment.debtId,
          debtName: debt.name,
          installmentId: installment.id,
          dueOn: installment.dueOn,
        });
      } catch (error) {
        this.logger.warn(`Failed to mark installment ${installment.id} late: ${error}`);
      }
    }

    const horizon = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const dueSoon = await this.prisma.debtInstallment.findMany({
      where: { status: 'SCHEDULED', dueOn: { gte: now, lte: horizon } },
    });
    for (const installment of dueSoon) {
      try {
        const debt = await this.prisma.debt.findUnique({ where: { id: installment.debtId } });
        if (!debt) continue;
        await this.events.emitAsync('debt.installment_due_soon', {
          userId: installment.userId,
          debtId: installment.debtId,
          debtName: debt.name,
          installmentId: installment.id,
          dueOn: installment.dueOn,
        });
      } catch (error) {
        this.logger.warn(`Failed to raise due-soon notification for installment ${installment.id}: ${error}`);
      }
    }
  }
}
