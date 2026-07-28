import { Injectable } from '@nestjs/common';
import { RecurrenceService } from './recurrence.service';

/** Public interface of the `recurrence` module (docs/02-architecture.md §4) — consumed by `notifications`, `forecasting`. */
@Injectable()
export class RecurrenceFacade {
  constructor(private readonly recurrenceService: RecurrenceService) {}

  upcoming(userId: string, days: number) {
    return this.recurrenceService.upcoming(userId, days);
  }

  dueForReminders(now?: Date) {
    return this.recurrenceService.dueForReminders(now);
  }
}
