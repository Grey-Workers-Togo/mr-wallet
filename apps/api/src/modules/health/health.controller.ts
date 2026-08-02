import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }

  /** Throws intentionally to verify Sentry wiring. Remove once confirmed working in the dashboard. */
  @Public()
  @Get('debug-sentry')
  debugSentry() {
    throw new Error('Sentry test error');
  }
}
