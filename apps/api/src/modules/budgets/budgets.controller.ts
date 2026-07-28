import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { BudgetsService } from './budgets.service';
import {
  CreateBudgetDto,
  FromTemplateDto,
  UpdateBudgetDto,
  createBudgetSchema,
  fromTemplateSchema,
  updateBudgetSchema,
} from './dto/budget.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.budgetsService.list(user.id);
  }

  @Get('current')
  current(@CurrentUser() user: RequestUser) {
    return this.budgetsService.current(user.id);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.budgetsService.getById(user.id, id);
  }

  @Get(':id/periods')
  periods(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.budgetsService.periods(user.id, id);
  }

  @Get(':id/periods/:periodId')
  periodById(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('periodId') periodId: string) {
    return this.budgetsService.periodById(user.id, id, periodId);
  }

  @Post()
  @Audit({ action: 'budget.create', entityType: 'Budget' })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createBudgetSchema)) dto: CreateBudgetDto) {
    return this.budgetsService.create(user.id, dto);
  }

  @Post('from-template')
  @Audit({ action: 'budget.from_template', entityType: 'Budget' })
  fromTemplate(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(fromTemplateSchema)) dto: FromTemplateDto) {
    return this.budgetsService.fromTemplate(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'budget.update', entityType: 'Budget' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBudgetSchema)) dto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'budget.delete', entityType: 'Budget' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.budgetsService.remove(user.id, id);
  }
}
