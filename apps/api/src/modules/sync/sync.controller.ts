import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { pushRequestSchema, PushRequest } from '@mr-wallet/sync-protocol';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { SyncService } from './sync.service';
import { ChangesQueryDto, changesQuerySchema, SnapshotQueryDto, snapshotQuerySchema } from './dto/changes-query.dto';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  // RG-SY10: one audit entry per push call (RG-AU3 batch convention), deviceId included in
  // metadata automatically by AuditInterceptor whenever the request body carries one.
  @Audit({ action: 'sync.push', entityType: 'SyncOperation' })
  push(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(pushRequestSchema)) dto: PushRequest) {
    return this.syncService.push(user.id, dto);
  }

  @Get('changes')
  changes(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(changesQuerySchema)) query: ChangesQueryDto) {
    return this.syncService.changes(user.id, query.since, query.limit);
  }

  @Get('snapshot')
  snapshot(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(snapshotQuerySchema)) query: SnapshotQueryDto) {
    return this.syncService.snapshot(user.id, query.limit);
  }
}
