import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { NotificationsService } from './notifications.service';
import {
  ListNotificationsDto,
  UpdatePreferencesDto,
  listNotificationsSchema,
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
  updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) dto: UpdatePreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user.id, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(user.id);
  }
}
