import { Injectable } from '@nestjs/common';
import { RecurrenceService } from './recurrence.service';
import { CreateRecurrenceDto, UpdateRecurrenceDto } from './dto/recurrence.dto';

/** Public interface of the `recurrence` module (docs/02-architecture.md §4) — consumed by `notifications`, `forecasting`, `sync`. */
@Injectable()
export class RecurrenceFacade {
  constructor(private readonly recurrenceService: RecurrenceService) {}

  upcoming(userId: string, days: number) {
    return this.recurrenceService.upcoming(userId, days);
  }

  getById(userId: string, id: string) {
    return this.recurrenceService.getById(userId, id);
  }

  create(userId: string, dto: CreateRecurrenceDto) {
    return this.recurrenceService.create(userId, dto);
  }

  update(userId: string, id: string, dto: UpdateRecurrenceDto) {
    return this.recurrenceService.update(userId, id, dto);
  }

  remove(userId: string, id: string) {
    return this.recurrenceService.remove(userId, id);
  }

  skipOccurrence(userId: string, id: string, occurrenceDate: Date) {
    return this.recurrenceService.skip(userId, id, occurrenceDate);
  }

  dueForReminders(now?: Date) {
    return this.recurrenceService.dueForReminders(now);
  }

  forecastOccurrences(userId: string, until: Date) {
    return this.recurrenceService.forecastOccurrences(userId, until);
  }
}
