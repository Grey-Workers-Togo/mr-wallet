import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/** Correlates a request across logs, error responses, and audit entries (docs/03 §14 `requestId`). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  }
}
