import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { TransactionsService } from './transactions.service';
import {
  BulkIdsDto,
  BulkUpdateDto,
  CreateTransactionDto,
  CreateTransferDto,
  ListTransactionsDto,
  UpdateTransactionDto,
  bulkIdsSchema,
  bulkUpdateSchema,
  createTransactionSchema,
  createTransferSchema,
  listTransactionsSchema,
  updateTransactionSchema,
} from './dto/transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(listTransactionsSchema)) query: ListTransactionsDto) {
    return this.transactionsService.list(user.id, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.transactionsService.summary(user.id, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transactionsService.getById(user.id, id);
  }

  @Post()
  @Audit({ action: 'transaction.create', entityType: 'Transaction' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createTransactionSchema)) dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(user.id, dto);
  }

  @Post('transfer')
  @Audit({ action: 'transaction.transfer', entityType: 'Transaction' })
  transfer(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createTransferSchema)) dto: CreateTransferDto,
  ) {
    return this.transactionsService.transfer(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'transaction.update', entityType: 'Transaction' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'transaction.delete', entityType: 'Transaction' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transactionsService.remove(user.id, id);
  }

  @Post('bulk')
  @Audit({ action: 'transaction.bulk_create', entityType: 'Transaction' })
  async bulkCreate(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createTransactionSchema.array())) dtos: CreateTransactionDto[],
  ) {
    const created = [];
    for (const dto of dtos) {
      created.push(await this.transactionsService.create(user.id, dto));
    }
    return created;
  }

  @Patch('bulk')
  @Audit({ action: 'transaction.bulk_update', entityType: 'Transaction' })
  bulkUpdate(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(bulkUpdateSchema)) dto: BulkUpdateDto,
  ) {
    return this.transactionsService.bulkUpdate(user.id, dto);
  }

  @Delete('bulk')
  @Audit({ action: 'transaction.bulk_delete', entityType: 'Transaction' })
  bulkDelete(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(bulkIdsSchema)) dto: BulkIdsDto) {
    return this.transactionsService.bulkDelete(user.id, dto);
  }
}
