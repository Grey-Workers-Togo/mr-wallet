import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../common/errors/app-error';
import { CreateSavedSearchDto, savedSearchFilterSchema } from './dto/saved-search.dto';
import { TransactionFilter } from './dto/transaction.dto';

@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.savedSearch.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async getById(userId: string, id: string) {
    const found = await this.prisma.savedSearch.findFirst({ where: { id, userId, deletedAt: null } });
    if (!found) {
      throw new NotFoundAppError('SAVED_SEARCH_NOT_FOUND');
    }
    return found;
  }

  create(userId: string, dto: CreateSavedSearchDto) {
    return this.prisma.savedSearch.create({ data: { userId, name: dto.name, filterJson: dto.filter } });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.prisma.savedSearch.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Re-parses the stored JSON through the filter schema so dates round-trip as `Date`, not ISO strings. */
  async getFilters(userId: string, id: string): Promise<TransactionFilter> {
    const saved = await this.getById(userId, id);
    return savedSearchFilterSchema.parse(saved.filterJson);
  }
}
