import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { UsersService } from './users.service';
import {
  SetPinDto,
  UpdateBaseCurrencyDto,
  UpdateMeDto,
  VerifyPinDto,
  setPinSchema,
  updateBaseCurrencySchema,
  updateMeSchema,
  verifyPinSchema,
} from './dto/update-me.dto';

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

  @Post('pin')
  @Audit({ action: 'user.pin_set', entityType: 'User' })
  setPin(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(setPinSchema)) dto: SetPinDto) {
    return this.usersService.setPin(user.id, dto);
  }

  @Post('pin/verify')
  verifyPin(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(verifyPinSchema)) dto: VerifyPinDto) {
    return this.usersService.verifyPin(user.id, dto);
  }

  @Delete('pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'user.pin_remove', entityType: 'User' })
  async removePin(@CurrentUser() user: RequestUser) {
    await this.usersService.removePin(user.id);
  }
}
