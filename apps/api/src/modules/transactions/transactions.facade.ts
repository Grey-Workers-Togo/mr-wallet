import { Injectable } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/transaction.dto';

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

  listForDedupe(userId: string, accountIds: string[]) {
    return this.transactionsService.listForDedupe(userId, accountIds);
  }

  listByImportBatch(userId: string, importBatchId: string) {
    return this.transactionsService.listByImportBatch(userId, importBatchId);
  }

  remove(userId: string, id: string) {
    return this.transactionsService.remove(userId, id);
  }

  listAllForExport(userId: string, filters: { accountId?: string; from?: Date; to?: Date }) {
    return this.transactionsService.listAllForExport(userId, filters);
  }
}
