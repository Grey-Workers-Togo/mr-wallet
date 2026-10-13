import { Injectable } from '@nestjs/common';
import { ForecastingService } from './forecasting.service';

/** Public interface of the `forecasting` module (docs/02-architecture.md §4) — consumed by `assistant`. */
@Injectable()
export class ForecastingFacade {
  constructor(private readonly forecastingService: ForecastingService) {}

  cashflowForecast(userId: string, months: number) {
    return this.forecastingService.cashflowForecast(userId, months);
  }
}
