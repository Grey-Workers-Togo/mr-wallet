import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { Public } from '../../common/auth/public.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CurrencyService } from './currency.service';
import { ConvertDto, CreateRateDto, convertSchema, createRateSchema } from './dto/currency.dto';

@Controller('currencies')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Public()
  @Get()
  list() {
    return this.currencyService.listCurrencies();
  }

  @Get('rates')
  rates(@CurrentUser() user: RequestUser, @Query('from') from: string, @Query('to') to: string) {
    return this.currencyService.listRates(from, to, user.id);
  }

  @Post('rates')
  @Audit({ action: 'currency.rate_create', entityType: 'ExchangeRate' })
  createRate(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createRateSchema)) dto: CreateRateDto) {
    return this.currencyService.createRate(user.id, dto);
  }

  @Delete('rates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'currency.rate_delete', entityType: 'ExchangeRate' })
  deleteRate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.currencyService.deleteRate(user.id, id);
  }

  @Post('convert')
  convert(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(convertSchema)) dto: ConvertDto) {
    return this.currencyService.convert(user.id, dto);
  }
}
