import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { softDeleteExtension } from './soft-delete.extension';

/**
 * Driver adapter replaces Prisma's built-in pool timeout (5s in ORM v6) with the raw `pg` driver's
 * default (none) — set explicitly here so a stalled connection fails fast instead of hanging forever.
 */
function createAdapter(): PrismaPg {
  return new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Default injectable client: soft-delete filtering applied.
 * For the audit/export escape hatch (docs/03 §1), inject the raw `PrismaClient` instead.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: createAdapter() });
    return this.$extends(softDeleteExtension) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}

/** Raw, unextended client — the deliberate escape hatch for audit consultation and full export (docs/03 §1). */
@Injectable()
export class RawPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: createAdapter() });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
