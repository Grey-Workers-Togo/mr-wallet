import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request } from 'express';

interface NormalizedErrorBody {
  code: string;
  params: Record<string, unknown>;
  requestId?: string;
}

/**
 * Every response body follows `{ code, params }`, never a free-text `message`
 * (docs/10 §1 bis, CLAUDE.md). Unknown/unexpected errors map to a generic INTERNAL_ERROR code
 * so no accidental stack trace or SQL text ever reaches the client.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const { status, body } = this.normalize(exception, request?.requestId);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`requestId=${body.requestId} code=${body.code}`, (exception as Error)?.stack);
    }

    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private normalize(exception: unknown, requestId?: string): { status: number; body: NormalizedErrorBody } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        const { code, params } = response as { code: string; params?: Record<string, unknown> };
        return { status: exception.getStatus(), body: { code, params: params ?? {}, requestId } };
      }
      return {
        status: exception.getStatus(),
        body: { code: this.statusToCode(exception.getStatus()), params: {}, requestId },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', params: {}, requestId },
    };
  }

  private statusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
