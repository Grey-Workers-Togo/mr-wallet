import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  forEntity(userId: string, entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { userId, entityType, entityId },
      orderBy: { occurredAt: 'asc' },
    });
  }
}
