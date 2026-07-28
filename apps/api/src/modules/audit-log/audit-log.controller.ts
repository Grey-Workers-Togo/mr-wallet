import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.auditLogService.list(user.id);
  }

  @Get(':entityType/:entityId')
  forEntity(
    @CurrentUser() user: RequestUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogService.forEntity(user.id, entityType, entityId);
  }
}
