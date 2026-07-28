import { Injectable } from '@nestjs/common';
import * as Money from '../../kernel/money';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError, NotFoundAppError, ValidationAppError } from '../../common/errors/app-error';
import { HttpStatus } from '@nestjs/common';
import { RateCandidate, resolveRate } from './domain/resolve-rate';
import { CreateRateDto, ConvertDto } from './dto/currency.dto';

@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  listCurrencies() {
    return this.prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  }

  private async getMinorUnits(code: string): Promise<number> {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) {
      throw new NotFoundAppError('CURRENCY_NOT_FOUND', { code });
    }
    return currency.minorUnits;
  }

  async getApplicableRate(userId: string, from: string, to: string, at: Date): Promise<RateCandidate> {
    if (from === to) {
      return { rate: '1', validFrom: at, source: 'PEGGED' };
    }

    const rows = await this.prisma.exchangeRate.findMany({
      where: {
        fromCurrency: from,
        toCurrency: to,
        OR: [{ userId }, { userId: null }],
      },
    });

    const candidates: RateCandidate[] = rows.map((r) => ({
      rate: r.rate.toString(),
      validFrom: r.validFrom,
      source: r.source,
    }));

    const resolved = resolveRate(candidates, at);
    if (!resolved) {
      throw new AppError('EXCHANGE_RATE_UNAVAILABLE', HttpStatus.NOT_FOUND, { from, to, at: at.toISOString() });
    }
    return resolved;
  }

  async convert(userId: string, dto: ConvertDto) {
    const at = dto.at ?? new Date();
    const [fromMinorUnits, toMinorUnits] = await Promise.all([
      this.getMinorUnits(dto.from),
      this.getMinorUnits(dto.to),
    ]);
    const rate = await this.getApplicableRate(userId, dto.from, dto.to, at);

    const converted = Money.convert(
      Money.of(BigInt(dto.amountMinor), dto.from),
      dto.to,
      rate.rate,
      fromMinorUnits,
      toMinorUnits,
    );

    return {
      amountMinor: converted.amountMinor.toString(),
      currency: converted.currency,
      rate: rate.rate,
      rateSource: rate.source,
      appliedAt: at.toISOString(),
    };
  }

  async createRate(userId: string, dto: CreateRateDto) {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new ValidationAppError('CURRENCY_SAME_PAIR');
    }
    await Promise.all([this.getMinorUnits(dto.fromCurrency), this.getMinorUnits(dto.toCurrency)]);

    return this.prisma.exchangeRate.create({
      data: {
        userId,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        rate: dto.rate,
        validFrom: dto.validFrom,
        source: 'MANUAL',
      },
    });
  }

  async deleteRate(userId: string, id: string): Promise<void> {
    const rate = await this.prisma.exchangeRate.findFirst({ where: { id, userId } });
    if (!rate) {
      throw new NotFoundAppError('EXCHANGE_RATE_NOT_FOUND');
    }
    await this.prisma.exchangeRate.delete({ where: { id } });
  }

  async listRates(from: string, to: string, userId: string) {
    return this.prisma.exchangeRate.findMany({
      where: { fromCurrency: from, toCurrency: to, OR: [{ userId }, { userId: null }] },
      orderBy: { validFrom: 'desc' },
    });
  }
}
