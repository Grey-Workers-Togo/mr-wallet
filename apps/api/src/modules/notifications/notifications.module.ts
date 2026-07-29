import { Module } from '@nestjs/common';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsFacade } from './notifications.facade';

@Module({
  imports: [RecurrenceModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsFacade],
  exports: [NotificationsFacade],
})
export class NotificationsModule {}
