import { Injectable } from '@nestjs/common';
import { RulesService } from './rules.service';
import { CandidateTransaction } from './domain/match-rule';

/** Public interface of the `rules` module (docs/02-architecture.md §4) — consumed by `transactions` (RG-T8). */
@Injectable()
export class RulesFacade {
  constructor(private readonly rulesService: RulesService) {}

  findMatch(userId: string, candidate: CandidateTransaction) {
    return this.rulesService.findMatch(userId, candidate);
  }

  incrementTimesApplied(id: string) {
    return this.rulesService.incrementTimesApplied(id);
  }
}
