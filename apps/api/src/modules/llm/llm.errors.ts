import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

/** RG-LL3: anything that is not a recovered transient error surfaces as this single stable code. */
export class LlmUnavailableError extends AppError {
  constructor(reason: string, params: Record<string, unknown> = {}) {
    super('LLM_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, { reason, ...params });
  }
}
