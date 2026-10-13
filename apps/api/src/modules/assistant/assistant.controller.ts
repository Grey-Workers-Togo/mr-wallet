import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { ThrottlePerUser } from '../../common/throttling/per-user-throttling';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AssistantService } from './assistant.service';
import { AskDto, askSchema } from './dto/ask.dto';

/**
 * No `@Audit`: the audit log would record the response, which carries the answer (RG-AP1). The only
 * persisted trace of a question is a row of counters.
 */
@Controller('assistant')
@ThrottlePerUser()
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  /**
   * RG-AQ4: API throttling applies on top of the quotas, tighter than the default 100/min, and counted
   * per user rather than per IP (many users share their operator's NAT address).
   */
  @Post('ask')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  ask(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(askSchema)) dto: AskDto) {
    return this.assistantService.ask(user.id, dto);
  }

  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.assistantService.status(user.id);
  }

  /**
   * RG-AP8: the consent is a write, so it is audited — the audit entry (who, when) is part of the
   * proof. It carries a date and nothing about any question.
   */
  @Put('opt-in')
  @Audit({ action: 'assistant.opt_in', entityType: 'User' })
  optIn(@CurrentUser() user: RequestUser) {
    return this.assistantService.optIn(user.id);
  }

  @Delete('opt-in')
  @Audit({ action: 'assistant.opt_out', entityType: 'User' })
  optOut(@CurrentUser() user: RequestUser) {
    return this.assistantService.optOut(user.id);
  }
}
