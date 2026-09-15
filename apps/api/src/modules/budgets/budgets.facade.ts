import { Injectable } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto, FromTemplateDto, UpdateBudgetDto } from './dto/budget.dto';

/** Public interface of the `budgets` module (docs/02-architecture.md §4) — consumed by `notifications`, `export`, `sync`. */
@Injectable()
export class BudgetsFacade {
  constructor(private readonly budgetsService: BudgetsService) {}

  list(userId: string) {
    return this.budgetsService.list(userId);
  }

  getById(userId: string, id: string) {
    return this.budgetsService.getById(userId, id);
  }

  create(userId: string, dto: CreateBudgetDto) {
    return this.budgetsService.create(userId, dto);
  }

  update(userId: string, id: string, dto: UpdateBudgetDto) {
    return this.budgetsService.update(userId, id, dto);
  }

  remove(userId: string, id: string) {
    return this.budgetsService.remove(userId, id);
  }

  planCreate(userId: string, dto: FromTemplateDto) {
    return this.budgetsService.fromTemplate(userId, dto);
  }

  extendAllPeriods() {
    return this.budgetsService.extendAllPeriods();
  }

  current(userId: string) {
    return this.budgetsService.current(userId);
  }
}
