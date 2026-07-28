import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto, createTagSchema, updateTagSchema } from './dto/tag.dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.tagsService.list(user.id);
  }

  @Post()
  @Audit({ action: 'tag.create', entityType: 'Tag' })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createTagSchema)) dto: CreateTagDto) {
    return this.tagsService.create(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'tag.update', entityType: 'Tag' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTagSchema)) dto: UpdateTagDto,
  ) {
    return this.tagsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'tag.delete', entityType: 'Tag' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.tagsService.remove(user.id, id);
  }
}
