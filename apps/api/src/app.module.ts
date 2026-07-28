import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './common/config/env.schema';
import { PrismaModule } from './common/prisma/prisma.module';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TagsModule } from './modules/tags/tags.module';
import { RulesModule } from './modules/rules/rules.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ImportModule } from './modules/import/import.module';
import { ExportModule } from './modules/export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    UsersModule,
    AuthModule,
    CurrencyModule,
    AccountsModule,
    CategoriesModule,
    TagsModule,
    RulesModule,
    TransactionsModule,
    ImportModule,
    ExportModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
