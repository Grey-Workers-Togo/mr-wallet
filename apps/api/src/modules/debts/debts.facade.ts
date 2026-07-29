import { Injectable } from '@nestjs/common';
import { DebtsService } from './debts.service';

/** Public interface of the `debts` module (docs/02-architecture.md §4) — consumed by `export`, `reporting`, `forecasting`. */
@Injectable()
export class DebtsFacade {
  constructor(private readonly debtsService: DebtsService) {}

  list(userId: string) {
    return this.debtsService.list(userId);
  }

  summary(userId: string) {
    return this.debtsService.summary(userId);
  }

  upcomingInstallments(userId: string, until: Date) {
    return this.debtsService.upcomingInstallments(userId, until);
  }
}
