import { Module } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RulesFacade } from './rules.facade';

@Module({
  controllers: [RulesController],
  providers: [RulesService, RulesFacade],
  exports: [RulesFacade],
})
export class RulesModule {}
