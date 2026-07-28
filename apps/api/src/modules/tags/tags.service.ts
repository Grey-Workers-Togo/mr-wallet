import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError } from '../../common/errors/app-error';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }

  async getById(userId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id, userId } });
    if (!tag) {
      throw new NotFoundAppError('TAG_NOT_FOUND');
    }
    return tag;
  }

  async create(userId: string, dto: CreateTagDto) {
    const existing = await this.prisma.tag.findUnique({ where: { userId_name: { userId, name: dto.name } } });
    if (existing) {
      throw new ConflictAppError('TAG_NAME_TAKEN', { name: dto.name });
    }
    return this.prisma.tag.create({ data: { userId, name: dto.name, color: dto.color } });
  }

  async update(userId: string, id: string, dto: UpdateTagDto) {
    await this.getById(userId, id);
    if (dto.name) {
      const existing = await this.prisma.tag.findUnique({ where: { userId_name: { userId, name: dto.name } } });
      if (existing && existing.id !== id) {
        throw new ConflictAppError('TAG_NAME_TAKEN', { name: dto.name });
      }
    }
    return this.prisma.tag.update({ where: { id }, data: dto });
  }

  /** No cascade (roadmap Lot 2): removes the tag and its links, transactions themselves are untouched. */
  async remove(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.prisma.transactionTag.deleteMany({ where: { tagId: id } });
    await this.prisma.tag.delete({ where: { id } });
  }
}
