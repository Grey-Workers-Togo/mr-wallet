import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { NotificationsService } from './notifications.service';
import {
  ListNotificationsDto,
  SubscribePushDto,
  UnsubscribePushDto,
  UpdatePreferencesDto,
  listNotificationsSchema,
  subscribePushSchema,
  unsubscribePushSchema,
  updatePreferencesSchema,
} from './dto/notification.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(listNotificationsSchema)) query: ListNotificationsDto) {
    return this.notificationsService.list(user.id, query.unreadOnly);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: RequestUser) {
    return this.notificationsService.preferences(user.id);
  }

  @Patch('preferences')
  @Audit({ action: 'notification.preferences_update', entityType: 'NotificationPreferences' })
  updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) dto: UpdatePreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user.id, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'notification.mark_read', entityType: 'Notification' })
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'notification.mark_all_read', entityType: 'Notification' })
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Get('push/public-key')
  publicKey() {
    return { publicKey: this.notificationsService.publicKey() };
  }

  @Post('push/subscribe')
  @Audit({ action: 'notification.push_subscribe', entityType: 'PushSubscription' })
  subscribe(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(subscribePushSchema)) dto: SubscribePushDto) {
    return this.notificationsService.subscribe(user.id, dto);
  }

  @Delete('push/subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'notification.push_unsubscribe', entityType: 'PushSubscription' })
  unsubscribe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(unsubscribePushSchema)) dto: UnsubscribePushDto,
  ) {
    return this.notificationsService.unsubscribe(user.id, dto);
  }

  @Get('push/devices')
  listDevices(@CurrentUser() user: RequestUser) {
    return this.notificationsService.listDevices(user.id);
  }

  @Delete('push/devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'notification.push_device_remove', entityType: 'PushSubscription' })
  removeDevice(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.removeDevice(user.id, id);
  }

  @Post('push/test')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendTestPush(@CurrentUser() user: RequestUser) {
    return this.notificationsService.sendTestPush(user.id);
  }
}
