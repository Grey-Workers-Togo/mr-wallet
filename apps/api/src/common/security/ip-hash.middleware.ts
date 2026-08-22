import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { hashIp } from './ip-hash';

/** Populates `req.ipHash` for every consumer that needs a pseudonymized client IP (docs/07 §5). */
@Injectable()
export class IpHashMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request & { ipHash?: string }, _res: Response, next: NextFunction): void {
    req.ipHash = hashIp(req.ip ?? 'unknown', this.config.getOrThrow('IP_HASH_SALT'));
    next();
  }
}
