import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { RecurrenceService } from './recurrence.service';
import {
  CreateRecurrenceDto,
  MaterializeDto,
  OccurrencesQueryDto,
  SkipOccurrenceDto,
  UpcomingQueryDto,
  UpdateRecurrenceDto,
  createRecurrenceSchema,
  materializeSchema,
  occurrencesQuerySchema,
  skipOccurrenceSchema,
  upcomingQuerySchema,
  updateRecurrenceSchema,
} from './dto/recurrence.dto';

@Controller('recurrences')
export class RecurrenceController {
  constructor(private readonly recurrenceService: RecurrenceService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.recurrenceService.list(user.id);
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: RequestUser) {
    return this.recurrenceService.suggestions(user.id);
  }

  @Get('upcoming')
  upcoming(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(upcomingQuerySchema)) query: UpcomingQueryDto) {
    return this.recurrenceService.upcoming(user.id, query.days);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.recurrenceService.getById(user.id, id);
  }

  @Get(':id/occurrences')
  occurrences(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(occurrencesQuerySchema)) query: OccurrencesQueryDto,
  ) {
    return this.recurrenceService.occurrences(user.id, id, query.until);
  }

  @Post()
  @Audit({ action: 'recurrence.create', entityType: 'RecurrenceRule' })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createRecurrenceSchema)) dto: CreateRecurrenceDto) {
    return this.recurrenceService.create(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'recurrence.update', entityType: 'RecurrenceRule' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecurrenceSchema)) dto: UpdateRecurrenceDto,
  ) {
    return this.recurrenceService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'recurrence.delete', entityType: 'RecurrenceRule' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.recurrenceService.remove(user.id, id);
  }

  @Post(':id/skip')
  @Audit({ action: 'recurrence.skip', entityType: 'RecurrenceRule' })
  skip(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(skipOccurrenceSchema)) dto: SkipOccurrenceDto,
  ) {
    return this.recurrenceService.skip(user.id, id, dto.occurrenceDate);
  }

  @Post(':id/materialize')
  @Audit({ action: 'recurrence.materialize', entityType: 'RecurrenceRule' })
  materialize(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(materializeSchema)) dto: MaterializeDto,
  ) {
    return this.recurrenceService.materialize(user.id, id, dto.occurrenceDate);
  }
}
