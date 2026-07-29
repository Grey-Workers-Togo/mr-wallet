import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { GoalsService } from './goals.service';
import {
  CreateContributionDto,
  CreateGoalDto,
  UpdateGoalDto,
  createContributionSchema,
  createGoalSchema,
  updateGoalSchema,
} from './dto/goal.dto';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.goalsService.list(user.id);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.goalsService.getById(user.id, id);
  }

  @Get(':id/progress')
  progress(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.goalsService.progress(user.id, id);
  }

  @Post()
  @Audit({ action: 'goal.create', entityType: 'SavingsGoal' })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createGoalSchema)) dto: CreateGoalDto) {
    return this.goalsService.create(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'goal.update', entityType: 'SavingsGoal' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGoalSchema)) dto: UpdateGoalDto,
  ) {
    return this.goalsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'goal.delete', entityType: 'SavingsGoal' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.goalsService.remove(user.id, id);
  }

  @Post(':id/contributions')
  @Audit({ action: 'goal.contribution_add', entityType: 'GoalContribution' })
  addContribution(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createContributionSchema)) dto: CreateContributionDto,
  ) {
    return this.goalsService.addContribution(user.id, id, dto);
  }

  @Delete(':id/contributions/:contributionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'goal.contribution_remove', entityType: 'GoalContribution' })
  removeContribution(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('contributionId') contributionId: string,
  ) {
    return this.goalsService.removeContribution(user.id, id, contributionId);
  }
}
