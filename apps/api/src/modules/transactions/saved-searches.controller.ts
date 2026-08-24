import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { SavedSearchesService } from './saved-searches.service';
import { CreateSavedSearchDto, createSavedSearchSchema } from './dto/saved-search.dto';

@Controller('saved-searches')
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.savedSearchesService.list(user.id);
  }

  @Post()
  @Audit({ action: 'saved_search.create', entityType: 'SavedSearch' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createSavedSearchSchema)) dto: CreateSavedSearchDto,
  ) {
    return this.savedSearchesService.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'saved_search.delete', entityType: 'SavedSearch' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.savedSearchesService.remove(user.id, id);
  }
}
