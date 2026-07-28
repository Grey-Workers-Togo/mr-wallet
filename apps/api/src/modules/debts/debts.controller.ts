import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { DebtsService } from './debts.service';
import {
  CreateDebtDto,
  RecordPaymentDto,
  RegenerateScheduleDto,
  SimulatePayoffDto,
  UpdateDebtDto,
  createDebtSchema,
  recordPaymentSchema,
  regenerateScheduleSchema,
  simulatePayoffSchema,
  updateDebtSchema,
} from './dto/debt.dto';

@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.debtsService.list(user.id);
  }

  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.debtsService.summary(user.id);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.debtsService.getById(user.id, id);
  }

  @Get(':id/schedule')
  schedule(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.debtsService.schedule(user.id, id);
  }

  @Get(':id/payments')
  payments(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.debtsService.payments(user.id, id);
  }

  @Post()
  @Audit({ action: 'debt.create', entityType: 'Debt' })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createDebtSchema)) dto: CreateDebtDto) {
    return this.debtsService.create(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'debt.update', entityType: 'Debt' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDebtSchema)) dto: UpdateDebtDto,
  ) {
    return this.debtsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'debt.delete', entityType: 'Debt' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.debtsService.remove(user.id, id);
  }

  @Post(':id/schedule/regenerate')
  @Audit({ action: 'debt.schedule_regenerate', entityType: 'Debt' })
  regenerateSchedule(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(regenerateScheduleSchema)) dto: RegenerateScheduleDto,
  ) {
    return this.debtsService.regenerateSchedule(user.id, id, dto);
  }

  @Post(':id/payments')
  @Audit({ action: 'debt.payment_record', entityType: 'DebtPayment' })
  recordPayment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) dto: RecordPaymentDto,
  ) {
    return this.debtsService.recordPayment(user.id, id, dto);
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'debt.payment_delete', entityType: 'DebtPayment' })
  removePayment(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.debtsService.removePayment(user.id, id, paymentId);
  }

  @Post(':id/simulate-payoff')
  simulatePayoff(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(simulatePayoffSchema)) dto: SimulatePayoffDto,
  ) {
    return this.debtsService.simulatePayoff(user.id, id, dto);
  }
}
