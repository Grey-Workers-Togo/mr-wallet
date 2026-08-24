import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ValidationAppError } from '../../common/errors/app-error';
import { AttachmentsService } from './attachments.service';

// Mirrors the shared UPLOAD_MAX_BYTES default (env.schema.ts) — kept a static constant here
// since multer interceptor options are evaluated at class-definition time, same as import.controller.ts.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

@Controller('transactions/:transactionId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param('transactionId') transactionId: string) {
    return this.attachmentsService.list(user.id, transactionId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  @Audit({ action: 'attachment.upload', entityType: 'Attachment' })
  upload(
    @CurrentUser() user: RequestUser,
    @Param('transactionId') transactionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new ValidationAppError('ATTACHMENT_FILE_REQUIRED');
    }
    return this.attachmentsService.upload(user.id, transactionId, file);
  }

  @Get(':id')
  async stream(
    @CurrentUser() user: RequestUser,
    @Param('transactionId') transactionId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { stream, mimeType, originalName } = await this.attachmentsService.streamFile(user.id, transactionId, id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    stream.pipe(res);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'attachment.delete', entityType: 'Attachment' })
  remove(
    @CurrentUser() user: RequestUser,
    @Param('transactionId') transactionId: string,
    @Param('id') id: string,
  ) {
    return this.attachmentsService.remove(user.id, transactionId, id);
  }
}
