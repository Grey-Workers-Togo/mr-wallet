import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodType } from 'zod';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ValidationAppError } from '../../common/errors/app-error';
import { ImportService } from './import.service';
import {
  CommitImportDto,
  CreateImportSourceDto,
  UploadImportDto,
  commitImportSchema,
  createImportSourceSchema,
  uploadImportSchema,
} from './dto/import.dto';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // docs/06 §2: 10 MB max.

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('sources')
  listSources(@CurrentUser() user: RequestUser) {
    return this.importService.listSources(user.id);
  }

  @Post('sources')
  @Audit({ action: 'import_source.create', entityType: 'ImportSource' })
  createSource(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const dto = this.parse<CreateImportSourceDto>(createImportSourceSchema, body);
    return this.importService.createSource(user.id, dto);
  }

  @Patch('sources/:id')
  @Audit({ action: 'import_source.update', entityType: 'ImportSource' })
  updateSource(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse<Partial<CreateImportSourceDto>>(createImportSourceSchema.partial(), body);
    return this.importService.updateSource(user.id, id, dto);
  }

  @Delete('sources/:id')
  @Audit({ action: 'import_source.delete', entityType: 'ImportSource' })
  removeSource(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.importService.removeSource(user.id, id);
  }

  @Get('batches')
  listBatches(@CurrentUser() user: RequestUser) {
    return this.importService.listBatches(user.id);
  }

  @Get('batches/:id')
  getBatch(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.importService.getBatch(user.id, id);
  }

  @Get('batches/:id/preview')
  preview(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.importService.preview(user.id, id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  @Audit({ action: 'import.upload', entityType: 'ImportBatch' })
  upload(@CurrentUser() user: RequestUser, @UploadedFile() file: Express.Multer.File, @Body('payload') payload: string) {
    if (!file) {
      throw new ValidationAppError('IMPORT_FILE_REQUIRED');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new ValidationAppError('IMPORT_PAYLOAD_INVALID_JSON');
    }
    const dto = this.parse<UploadImportDto>(uploadImportSchema, raw);
    return this.importService.upload(user.id, file, dto);
  }

  @Post('batches/:id/commit')
  @Audit({ action: 'import.commit', entityType: 'ImportBatch' })
  commit(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: unknown) {
    const dto = this.parse<CommitImportDto>(commitImportSchema, body ?? {});
    return this.importService.commit(user.id, id, dto.excludeRowIndexes);
  }

  @Post('batches/:id/revert')
  @Audit({ action: 'import.revert', entityType: 'ImportBatch' })
  revert(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.importService.revert(user.id, id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parse<T>(schema: ZodType<T, any, any>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({ field: issue.path.join('.'), code: issue.code.toUpperCase() }));
      throw new ValidationAppError('VALIDATION_FAILED', { details });
    }
    return result.data;
  }
}
