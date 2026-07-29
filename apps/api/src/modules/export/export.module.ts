import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [AccountsModule, TransactionsModule, CategoriesModule, TagsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
