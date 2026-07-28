import { Injectable } from '@nestjs/common';
import { ReportingService } from './reporting.service';

/** Public interface of the `reporting` module (docs/02-architecture.md §4) — consumed by `forecasting`. */
@Injectable()
export class ReportingFacade {
  constructor(private readonly reportingService: ReportingService) {}

  netWorth(userId: string) {
    return this.reportingService.netWorth(userId);
  }
}
