import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateUserInput {
  email: string;
  /** Null for a social-only account created via OAuth signup (no password set). */
  passwordHash: string | null;
  baseCurrency: string;
  displayName?: string;
  locale?: string;
  timezone?: string;
  /** Set for an OAuth signup: the provider already vouched for the address, no verification email needed. */
  emailVerifiedAt?: Date;
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
        displayName: input.displayName,
        locale: input.locale ?? 'fr-FR',
        timezone: input.timezone ?? 'Africa/Porto-Novo',
        emailVerifiedAt: input.emailVerifiedAt,
      },
    });
  }

  markLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  markEmailVerified(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }
}
