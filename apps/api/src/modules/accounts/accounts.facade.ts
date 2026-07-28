import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountsService } from './accounts.service';

/** Public interface of the `accounts` module (docs/02-architecture.md §4) — consumed by `transactions`, `debts`, `goals`. */
@Injectable()
export class AccountsFacade {
  constructor(private readonly accountsService: AccountsService) {}

  getById(userId: string, id: string) {
    return this.accountsService.getById(userId, id);
  }

  adjustBalance(id: string, deltaMinor: bigint, tx?: Prisma.TransactionClient) {
    return this.accountsService.adjustBalance(id, deltaMinor, tx);
  }

  list(userId: string) {
    return this.accountsService.list(userId, true);
  }
}
