import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { RulesService } from './rules.service';
import { CreateRuleDto, UpdateRuleDto, createRuleSchema, updateRuleSchema } from './dto/rule.dto';

@Controller('categorization-rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.rulesService.list(user.id);
  }

  @Post()
  @Audit({ action: 'categorization_rule.create', entityType: 'CategorizationRule' })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createRuleSchema)) dto: CreateRuleDto) {
    return this.rulesService.create(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'categorization_rule.update', entityType: 'CategorizationRule' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRuleSchema)) dto: UpdateRuleDto,
  ) {
    return this.rulesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'categorization_rule.delete', entityType: 'CategorizationRule' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.rulesService.remove(user.id, id);
  }
}
