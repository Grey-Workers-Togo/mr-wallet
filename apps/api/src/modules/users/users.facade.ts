import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  baseCurrency: string;
  locale?: string;
  timezone?: string;
}

/**
 * Public interface of the `users` module (docs/02-architecture.md §4, rule 1).
 * `auth` depends only on this facade, never on `UsersService` directly.
 */
@Injectable()
export class UsersFacade {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id } });
  }

  createUser(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        baseCurrency: input.baseCurrency,
        locale: input.locale ?? 'fr-FR',
        timezone: input.timezone ?? 'Africa/Porto-Novo',
      },
    });
  }

  markLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }
}
