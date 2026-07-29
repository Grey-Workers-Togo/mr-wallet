import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ValidationAppError } from '../errors/app-error';

/**
 * Every request body is validated by a Zod schema before it reaches the service
 * (docs/10-conventions-dev.md §4). Validation errors carry stable `code`+`details`, never a message.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code.toUpperCase(),
      }));
      throw new ValidationAppError('VALIDATION_FAILED', { details });
    }
    return result.data;
  }
}
