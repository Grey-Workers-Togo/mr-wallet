import { Global, Module } from '@nestjs/common';
import { PrismaService, RawPrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, RawPrismaService],
  exports: [PrismaService, RawPrismaService],
})
export class PrismaModule {}
