import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ReconciliationService } from './reconciliation.service';
import { ReconcileAccountDto, reconcileAccountSchema } from './dto/reconcile.dto';

/**
 * Declares `POST /accounts/:id/reconcile` (docs/12-roadmap-v2.md Lot 19) from the `reconciliation`
 * module rather than `accounts` — the handler needs TransactionsFacade + CategoriesFacade, and
 * `accounts` must never depend on `transactions` (which already depends on `accounts`;
 * docs/02-architecture.md §4 forbids the cycle). The URL is what the roadmap and docs/05-api.md
 * specify; which module owns the file is an internal wiring detail.
 */
@Controller('accounts')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post(':id/reconcile')
  @Audit({ action: 'account.reconcile', entityType: 'Account' })
  reconcile(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reconcileAccountSchema)) dto: ReconcileAccountDto,
  ) {
    return this.reconciliationService.reconcile(user.id, id, dto);
  }
}
