import { Injectable } from '@nestjs/common';
import { GoalsService } from './goals.service';

/** Public interface of the `goals` module (docs/02-architecture.md §4) — consumed by `export`, `reporting`, `forecasting`. */
@Injectable()
export class GoalsFacade {
  constructor(private readonly goalsService: GoalsService) {}

  list(userId: string) {
    return this.goalsService.list(userId);
  }
}
