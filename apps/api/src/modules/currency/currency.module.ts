import { Module } from '@nestjs/common';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';
import { CurrencyFacade } from './currency.facade';

@Module({
  controllers: [CurrencyController],
  providers: [CurrencyService, CurrencyFacade],
  exports: [CurrencyFacade],
})
export class CurrencyModule {}
