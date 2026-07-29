import { Injectable } from '@nestjs/common';
import { BudgetsService } from './budgets.service';

/** Public interface of the `budgets` module (docs/02-architecture.md §4) — consumed by `notifications`, `export`. */
@Injectable()
export class BudgetsFacade {
  constructor(private readonly budgetsService: BudgetsService) {}

  list(userId: string) {
    return this.budgetsService.list(userId);
  }

  extendAllPeriods() {
    return this.budgetsService.extendAllPeriods();
  }

  current(userId: string) {
    return this.budgetsService.current(userId);
  }
}
