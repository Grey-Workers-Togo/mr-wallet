import { Injectable } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** Public interface of the `notifications` module (docs/02-architecture.md §4). */
@Injectable()
export class NotificationsFacade {
  constructor(private readonly notificationsService: NotificationsService) {}

  create(input: Parameters<NotificationsService['create']>[0]) {
    return this.notificationsService.create(input);
  }
}
