import { Injectable } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { CreateDebtDto, RecordPaymentDto, SimulatePayoffDto, UpdateDebtDto } from './dto/debt.dto';

/** Public interface of the `debts` module (docs/02-architecture.md §4) — consumed by `export`, `reporting`, `forecasting`, `sync`. */
@Injectable()
export class DebtsFacade {
  constructor(private readonly debtsService: DebtsService) {}

  list(userId: string) {
    return this.debtsService.list(userId);
  }

  getById(userId: string, id: string) {
    return this.debtsService.getById(userId, id);
  }

  create(userId: string, dto: CreateDebtDto) {
    return this.debtsService.create(userId, dto);
  }

  update(userId: string, id: string, dto: UpdateDebtDto) {
    return this.debtsService.update(userId, id, dto);
  }

  recordPayment(userId: string, debtId: string, dto: RecordPaymentDto) {
    return this.debtsService.recordPayment(userId, debtId, dto);
  }

  simulateEarlyRepayment(userId: string, debtId: string, dto: SimulatePayoffDto) {
    return this.debtsService.simulatePayoff(userId, debtId, dto);
  }

  summary(userId: string) {
    return this.debtsService.summary(userId);
  }

  upcomingInstallments(userId: string, until: Date) {
    return this.debtsService.upcomingInstallments(userId, until);
  }
}
