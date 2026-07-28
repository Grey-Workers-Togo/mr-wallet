import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../common/errors/app-error';
import { UpdateBaseCurrencyDto, UpdateMeDto } from './dto/update-me.dto';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  baseCurrency: string;
  locale: string;
  timezone: string;
  weekStartsOn: number;
  monthStartDay: number;
  createdAt: Date;
}

function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    baseCurrency: user.baseCurrency,
    locale: user.locale,
    timezone: user.timezone,
    weekStartsOn: user.weekStartsOn,
    monthStartDay: user.monthStartDay,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!user) {
      throw new NotFoundAppError('USER_NOT_FOUND');
    }
    return toProfile(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<UserProfile> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    return toProfile(user);
  }

  async updateBaseCurrency(userId: string, dto: UpdateBaseCurrencyDto): Promise<UserProfile> {
    const currency = await this.prisma.currency.findUnique({ where: { code: dto.baseCurrency } });
    if (!currency) {
      throw new NotFoundAppError('CURRENCY_NOT_FOUND', { code: dto.baseCurrency });
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { baseCurrency: dto.baseCurrency },
    });
    return toProfile(user);
  }

  /** Soft delete + sessions revocation; physical purge at J+30 is a scheduled task (docs/07 §8). */
  async deleteMe(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.delete({ where: { id: userId } }),
      this.prisma.session.updateMany({ where: { userId }, data: { revokedAt: new Date() } }),
    ]);
  }
}
