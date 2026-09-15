import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

/** Public interface of the `accounts` module (docs/02-architecture.md §4) — consumed by `transactions`, `debts`, `goals`, `reconciliation`, `sync`. */
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

  create(userId: string, dto: CreateAccountDto) {
    return this.accountsService.create(userId, dto);
  }

  update(userId: string, id: string, dto: UpdateAccountDto) {
    return this.accountsService.update(userId, id, dto);
  }

  archive(userId: string, id: string) {
    return this.accountsService.archive(userId, id);
  }

  remove(userId: string, id: string) {
    return this.accountsService.remove(userId, id);
  }

  updateLastReconciledAt(userId: string, id: string, at: Date) {
    return this.accountsService.updateLastReconciledAt(userId, id, at);
  }
}
