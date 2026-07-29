import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * All application-thrown HTTP errors carry a stable `code` + `params`, never a human message
 * (docs/03 §"Aucun texte lisible" / CLAUDE.md "Langues"). The client resolves `code` to text via i18n.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    status: HttpStatus,
    public readonly params: Record<string, unknown> = {},
  ) {
    super({ code, params }, status);
  }
}

export class NotFoundAppError extends AppError {
  constructor(code: string, params: Record<string, unknown> = {}) {
    super(code, HttpStatus.NOT_FOUND, params);
  }
}

export class ConflictAppError extends AppError {
  constructor(code: string, params: Record<string, unknown> = {}) {
    super(code, HttpStatus.CONFLICT, params);
  }
}

export class ValidationAppError extends AppError {
  constructor(code: string, params: Record<string, unknown> = {}) {
    super(code, HttpStatus.BAD_REQUEST, params);
  }
}
