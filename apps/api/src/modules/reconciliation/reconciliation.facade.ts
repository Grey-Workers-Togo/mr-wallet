import { Injectable } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconcileAccountDto } from './dto/reconcile.dto';

/** Public interface of the `reconciliation` module (docs/02-architecture.md §4) — consumed by `sync`. */
@Injectable()
export class ReconciliationFacade {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  reconcile(userId: string, accountId: string, dto: ReconcileAccountDto) {
    return this.reconciliationService.reconcile(userId, accountId, dto);
  }
}
