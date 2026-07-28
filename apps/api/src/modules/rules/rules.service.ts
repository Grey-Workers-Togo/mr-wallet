import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../common/errors/app-error';
import { CandidateTransaction, ruleMatches } from './domain/match-rule';
import { CreateRuleDto, UpdateRuleDto } from './dto/rule.dto';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.categorizationRule.findMany({
      where: { userId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getById(userId: string, id: string) {
    const rule = await this.prisma.categorizationRule.findFirst({ where: { id, userId } });
    if (!rule) {
      throw new NotFoundAppError('RULE_NOT_FOUND');
    }
    return rule;
  }

  create(userId: string, dto: CreateRuleDto) {
    return this.prisma.categorizationRule.create({
      data: {
        userId,
        priority: dto.priority,
        matchField: dto.matchField,
        matchType: dto.matchType,
        matchValue: dto.matchValue,
        minAmountMinor: dto.minAmountMinor ? BigInt(dto.minAmountMinor) : null,
        maxAmountMinor: dto.maxAmountMinor ? BigInt(dto.maxAmountMinor) : null,
        accountId: dto.accountId,
        categoryId: dto.categoryId,
        addTagIds: dto.addTagIds,
        setPayee: dto.setPayee,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateRuleDto) {
    await this.getById(userId, id);
    return this.prisma.categorizationRule.update({
      where: { id },
      data: {
        ...dto,
        minAmountMinor: dto.minAmountMinor !== undefined ? BigInt(dto.minAmountMinor) : undefined,
        maxAmountMinor: dto.maxAmountMinor !== undefined ? BigInt(dto.maxAmountMinor) : undefined,
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.prisma.categorizationRule.delete({ where: { id } });
  }

  /** RG-T8: active rules ordered by descending priority, first match wins. */
  async findMatch(userId: string, candidate: CandidateTransaction) {
    const rules = await this.prisma.categorizationRule.findMany({
      where: { userId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return rules.find((rule) => ruleMatches(rule, candidate)) ?? null;
  }

  incrementTimesApplied(id: string) {
    return this.prisma.categorizationRule.update({ where: { id }, data: { timesApplied: { increment: 1 } } });
  }
}
