import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { RulesModule } from '../rules/rules.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsFacade } from './transactions.facade';
import { SavedSearchesController } from './saved-searches.controller';
import { SavedSearchesService } from './saved-searches.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [AccountsModule, CategoriesModule, RulesModule],
  controllers: [TransactionsController, SavedSearchesController, AttachmentsController],
  providers: [TransactionsService, TransactionsFacade, SavedSearchesService, AttachmentsService],
  exports: [TransactionsFacade],
})
export class TransactionsModule {}
