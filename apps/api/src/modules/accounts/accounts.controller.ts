import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto, createAccountSchema, updateAccountSchema } from './dto/account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query('includeArchived') includeArchived?: string) {
    return this.accountsService.list(user.id, includeArchived === 'true');
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.getById(user.id, id);
  }

  @Post()
  @Audit({ action: 'account.create', entityType: 'Account' })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createAccountSchema)) dto: CreateAccountDto) {
    return this.accountsService.create(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'account.update', entityType: 'Account' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'account.delete', entityType: 'Account' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.remove(user.id, id);
  }

  @Post(':id/archive')
  @Audit({ action: 'account.archive', entityType: 'Account' })
  archive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.archive(user.id, id);
  }

  @Post(':id/unarchive')
  @Audit({ action: 'account.archive', entityType: 'Account' })
  unarchive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.unarchive(user.id, id);
  }

  @Post(':id/reconcile')
  @Audit({ action: 'account.reconcile', entityType: 'Account' })
  reconcile(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.reconcile(user.id, id);
  }
}
