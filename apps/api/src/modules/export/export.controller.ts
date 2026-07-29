import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ExportService } from './export.service';
import { ExportFullDto, ExportTransactionsDto, exportFullSchema, exportTransactionsSchema } from './dto/export.dto';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('transactions')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'export.transactions', entityType: 'ExportJob' })
  async exportTransactions(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(exportTransactionsSchema)) dto: ExportTransactionsDto,
    @Res() res: Response,
  ) {
    const { buffer, filename, contentType } = await this.exportService.exportTransactions(user.id, dto);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('full')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'export.full', entityType: 'ExportJob' })
  async exportFull(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(exportFullSchema)) _dto: ExportFullDto, @Res() res: Response) {
    const { stream, filename } = await this.exportService.exportFull(user.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }
}
