import { Injectable } from '@nestjs/common';
import { CurrencyService } from './currency.service';

/** Public interface of the `currency` module (docs/02-architecture.md §4) — consumed by `accounts`, `debts`, `goals`. */
@Injectable()
export class CurrencyFacade {
  constructor(private readonly currencyService: CurrencyService) {}

  getApplicableRate(userId: string, from: string, to: string, at: Date) {
    return this.currencyService.getApplicableRate(userId, from, to, at);
  }
}
