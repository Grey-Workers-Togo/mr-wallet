import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, fixedClock, parseFixedInstant, systemClock, type Clock } from './clock';

/**
 * `CLOCK_FIXED_AT` is validated at boot (`env.schema.ts`): a valid instant, and never in production.
 * The factory reads it again only to build the clock, and says loudly when it is not the system's.
 */
@Global()
@Module({
  providers: [
    {
      provide: CLOCK,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Clock => {
        const fixedAt = config.getOrThrow<string>('CLOCK_FIXED_AT');
        if (fixedAt === '') return systemClock;
        const at = parseFixedInstant(fixedAt);
        if (!at) throw new Error('CLOCK_FIXED_AT is not a valid instant');
        new Logger('Clock').warn(`CLOCK_FIXED_AT is set: the application reads "now" as ${at.toISOString()}`);
        return fixedClock(at);
      },
    },
  ],
  exports: [CLOCK],
})
export class ClockModule {}
