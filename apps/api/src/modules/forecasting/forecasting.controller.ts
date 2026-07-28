import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ForecastingService } from './forecasting.service';
import { CashflowForecastDto, NetWorthForecastDto, cashflowForecastSchema, netWorthForecastSchema } from './dto/forecast.dto';

@Controller('forecast')
export class ForecastingController {
  constructor(private readonly forecastingService: ForecastingService) {}

  @Get('cashflow')
  cashflow(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(cashflowForecastSchema)) query: CashflowForecastDto) {
    return this.forecastingService.cashflowForecast(user.id, query.months);
  }

  @Get('net-worth')
  netWorth(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(netWorthForecastSchema)) query: NetWorthForecastDto) {
    return this.forecastingService.netWorthForecast(user.id, query.months);
  }
}
