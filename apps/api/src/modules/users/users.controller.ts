import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { UsersService } from './users.service';
import { UpdateBaseCurrencyDto, UpdateMeDto, updateBaseCurrencySchema, updateMeSchema } from './dto/update-me.dto';

@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: RequestUser) {
    return this.usersService.getMe(user.id);
  }

  @Patch()
  @Audit({ action: 'user.update', entityType: 'User' })
  updateMe(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(updateMeSchema)) dto: UpdateMeDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Patch('base-currency')
  @Audit({ action: 'user.base_currency_change', entityType: 'User' })
  updateBaseCurrency(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateBaseCurrencySchema)) dto: UpdateBaseCurrencyDto,
  ) {
    return this.usersService.updateBaseCurrency(user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'user.delete', entityType: 'User' })
  async deleteMe(@CurrentUser() user: RequestUser) {
    await this.usersService.deleteMe(user.id);
  }
}
