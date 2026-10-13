import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountsFacade } from '../accounts/accounts.facade';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsFacade } from '../budgets/budgets.facade';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { DebtsFacade } from '../debts/debts.facade';
import { DebtsModule } from '../debts/debts.module';
import { ForecastingFacade } from '../forecasting/forecasting.facade';
import { ForecastingModule } from '../forecasting/forecasting.module';
import { GoalsFacade } from '../goals/goals.facade';
import { GoalsModule } from '../goals/goals.module';
import { LlmModule } from '../llm/llm.module';
import { ReportingFacade } from '../reporting/reporting.facade';
import { ReportingModule } from '../reporting/reporting.module';
import { UsersModule } from '../users/users.module';
import { AssistantController } from './assistant.controller';
import { AssistantDataVersionService } from './assistant-data-version.service';
import { AssistantOrchestrator } from './assistant.orchestrator';
import { AssistantService } from './assistant.service';
import { AssistantUsageService } from './assistant-usage.service';
import { buildToolCatalogue } from './tools/catalogue';
import { ToolRegistry } from './tools/tool-registry';
import { ASSISTANT_TRACER, LangfuseTracer, NoopTracer, type AssistantTracer } from './tracing/assistant-tracer';

/**
 * ADR-0016 §4: `assistant → llm, reporting, budgets, accounts, categories, forecasting, goals, debts`
 * (and `users` for the profile). No existing module depends on it. The endpoints exist whatever the
 * flags say; they answer `ASSISTANT_DISABLED` until `ASSISTANT_ENABLED` and the allowlist open them.
 */
@Module({
  imports: [
    LlmModule,
    UsersModule,
    ReportingModule,
    BudgetsModule,
    AccountsModule,
    CategoriesModule,
    ForecastingModule,
    GoalsModule,
    DebtsModule,
  ],
  controllers: [AssistantController],
  providers: [
    ToolRegistry,
    AssistantOrchestrator,
    AssistantService,
    AssistantUsageService,
    AssistantDataVersionService,
    {
      provide: ASSISTANT_TRACER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AssistantTracer => {
        const host = config.getOrThrow<string>('LANGFUSE_HOST');
        if (host === '') return new NoopTracer();
        return new LangfuseTracer({
          host,
          publicKey: config.getOrThrow<string>('LANGFUSE_PUBLIC_KEY'),
          secretKey: config.getOrThrow<string>('LANGFUSE_SECRET_KEY'),
        });
      },
    },
  ],
})
export class AssistantModule implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly reporting: ReportingFacade,
    private readonly accounts: AccountsFacade,
    private readonly budgets: BudgetsFacade,
    private readonly goals: GoalsFacade,
    private readonly debts: DebtsFacade,
    private readonly forecasting: ForecastingFacade,
  ) {}

  /** ADR-0016 §1: the closed catalogue, registered once. */
  onModuleInit(): void {
    for (const tool of buildToolCatalogue({
      reporting: this.reporting,
      accounts: this.accounts,
      budgets: this.budgets,
      goals: this.goals,
      debts: this.debts,
      forecasting: this.forecasting,
    })) {
      this.registry.register(tool);
    }
  }
}
