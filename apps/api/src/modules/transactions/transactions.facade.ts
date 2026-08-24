import { Injectable } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto, CreateTransferDto } from './dto/transaction.dto';

/** Public interface of the `transactions` module (docs/02-architecture.md §4) — consumed by `budgets`, `goals`, `import`, `debts`. */
@Injectable()
export class TransactionsFacade {
  constructor(private readonly transactionsService: TransactionsService) {}

  getById(userId: string, id: string) {
    return this.transactionsService.getById(userId, id);
  }

  /** docs/06 §9: `import` never writes to the DB directly — always through this facade (docs/02 §4). */
  createFromImport(userId: string, dto: CreateTransactionDto, importBatchId: string, externalRef?: string) {
    return this.transactionsService.create(userId, dto, { source: 'IMPORT', importBatchId, externalRef });
  }

  /** RG-R4: recurrence materialization never writes to the DB directly — always through this facade. */
  createFromRecurrence(userId: string, dto: CreateTransactionDto, recurrenceId: string) {
    return this.transactionsService.create(userId, dto, { source: 'RECURRENCE', recurrenceId });
  }

  /** RG-D9: a debt payment never writes to the DB directly — always through this facade. */
  createFromDebtPayment(userId: string, dto: CreateTransactionDto, debtPaymentId: string) {
    return this.transactionsService.create(userId, dto, { source: 'DEBT_PAYMENT', debtPaymentId });
  }

  /** RG-D9/RG-T10: deleting a `DebtPayment` cascades to its transaction — the only caller allowed to bypass the guard. */
  removeDebtPaymentTransaction(userId: string, id: string) {
    return this.transactionsService.remove(userId, id, { allowDebtPayment: true });
  }

  /** A debt linked to an account books its principal as a transaction — never written to the DB directly. */
  createFromDebtCreation(userId: string, dto: CreateTransactionDto, debtId: string) {
    return this.transactionsService.create(userId, dto, { source: 'DEBT_CREATION', debtId });
  }

  /** Deleting a debt cascades to the transaction that booked its principal — the only caller allowed to bypass the guard. */
  removeDebtCreationTransaction(userId: string, id: string) {
    return this.transactionsService.remove(userId, id, { allowDebtCreation: true });
  }

  listForDedupe(userId: string, accountIds: string[]) {
    return this.transactionsService.listForDedupe(userId, accountIds);
  }

  listByImportBatch(userId: string, importBatchId: string) {
    return this.transactionsService.listByImportBatch(userId, importBatchId);
  }

  remove(userId: string, id: string) {
    return this.transactionsService.remove(userId, id);
  }

  /** RG-G5: a goal contribution may generate a real transfer to the linked savings account. */
  transfer(userId: string, dto: CreateTransferDto) {
    return this.transactionsService.transfer(userId, dto);
  }

  listAllForExport(userId: string, filters: { accountId?: string; from?: Date; to?: Date }) {
    return this.transactionsService.listAllForExport(userId, filters);
  }

  monthlyNonRecurringExpenseTotals(userId: string, monthsBack: number) {
    return this.transactionsService.monthlyNonRecurringExpenseTotals(userId, monthsBack);
  }
}
