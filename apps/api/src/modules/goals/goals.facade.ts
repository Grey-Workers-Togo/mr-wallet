import { Injectable } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CreateContributionDto, CreateGoalDto, UpdateGoalDto } from './dto/goal.dto';

/** Public interface of the `goals` module (docs/02-architecture.md §4) — consumed by `export`, `reporting`, `forecasting`, `sync`. */
@Injectable()
export class GoalsFacade {
  constructor(private readonly goalsService: GoalsService) {}

  list(userId: string) {
    return this.goalsService.list(userId);
  }

  getById(userId: string, id: string) {
    return this.goalsService.getById(userId, id);
  }

  create(userId: string, dto: CreateGoalDto) {
    return this.goalsService.create(userId, dto);
  }

  update(userId: string, id: string, dto: UpdateGoalDto) {
    return this.goalsService.update(userId, id, dto);
  }

  remove(userId: string, id: string) {
    return this.goalsService.remove(userId, id);
  }

  contribute(userId: string, goalId: string, dto: CreateContributionDto) {
    return this.goalsService.addContribution(userId, goalId, dto);
  }
}
