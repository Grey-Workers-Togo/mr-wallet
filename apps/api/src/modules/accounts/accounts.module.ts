import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountsFacade } from './accounts.facade';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountsFacade],
  exports: [AccountsFacade],
})
export class AccountsModule {}
