import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError, ValidationAppError } from '../../common/errors/app-error';
import { SYSTEM_CATEGORY_DEFINITIONS, localeFromUserLocale, resolveCategoryName } from './domain/category-i18n';
import { CreateCategoryDto, ReorderCategoriesDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called once at registration (docs/09-roadmap.md Lot 2) — clones the system category set for a new user. */
  async seedSystemDefaults(userId: string): Promise<void> {
    await this.prisma.category.createMany({
      data: SYSTEM_CATEGORY_DEFINITIONS.map((definition, index) => ({
        userId,
        i18nKey: definition.i18nKey,
        kind: definition.kind,
        isSystem: true,
        sortOrder: index,
      })),
    });
  }

  resolveName(category: { name: string | null; i18nKey: string | null }, locale: 'fr' | 'en'): string {
    return resolveCategoryName(category, locale);
  }

  list(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getById(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, userId } });
    if (!category) {
      throw new NotFoundAppError('CATEGORY_NOT_FOUND');
    }
    return category;
  }

  private async userLocale(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
    return localeFromUserLocale(user?.locale ?? 'fr');
  }

  /** RG-C7: uniqueness on the *resolved* name, within the same parent — not a SQL constraint. */
  private async assertNameAvailable(
    userId: string,
    parentId: string | null,
    name: string,
    excludeId: string | undefined,
    locale: 'fr' | 'en',
  ) {
    const siblings = await this.prisma.category.findMany({ where: { userId, parentId } });
    const collision = siblings.some(
      (sibling) =>
        sibling.id !== excludeId && resolveCategoryName(sibling, locale).toLowerCase() === name.toLowerCase(),
    );
    if (collision) {
      throw new ConflictAppError('CATEGORY_NAME_TAKEN', { name });
    }
  }

  async create(userId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.getById(userId, dto.parentId);
      if (parent.parentId) {
        // RG-C1: max depth 2 — a sub-category cannot have children.
        throw new ValidationAppError('CATEGORY_MAX_DEPTH_EXCEEDED');
      }
      if (parent.kind !== dto.kind) {
        // RG-C2: a category and its parent always share the same kind.
        throw new ValidationAppError('CATEGORY_KIND_MISMATCH');
      }
    }

    const locale = await this.userLocale(userId);
    await this.assertNameAvailable(userId, dto.parentId ?? null, dto.name, undefined, locale);

    return this.prisma.category.create({
      data: {
        userId,
        parentId: dto.parentId,
        name: dto.name,
        kind: dto.kind,
        color: dto.color,
        icon: dto.icon,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.getById(userId, id);

    if (dto.name) {
      const locale = await this.userLocale(userId);
      await this.assertNameAvailable(userId, category.parentId, dto.name, id, locale);
    }

    // RG-C8: renaming a system category never flips `isSystem` — it stays non-deletable.
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string, reassignTo?: string): Promise<{ movedCount: number }> {
    const category = await this.getById(userId, id);
    if (category.isSystem) {
      // RG-C3: a system category can be renamed/recolored/archived, never deleted.
      throw new ConflictAppError('CATEGORY_SYSTEM_NOT_DELETABLE');
    }

    const usedCount = await this.prisma.transaction.count({ where: { userId, categoryId: id } });
    if (usedCount > 0 && !reassignTo) {
      // RG-C4: deleting a used category requires a reassignment target.
      throw new ValidationAppError('CATEGORY_REASSIGN_REQUIRED', { usedCount });
    }
    if (reassignTo) {
      const target = await this.getById(userId, reassignTo);
      if (target.kind !== category.kind) {
        throw new ValidationAppError('CATEGORY_KIND_MISMATCH');
      }
    }

    // RG-C4: atomic — reassignment + deletion logged as a single audit action.
    return this.prisma.$transaction(async (tx) => {
      let movedCount = 0;
      if (reassignTo && usedCount > 0) {
        const result = await tx.transaction.updateMany({
          where: { userId, categoryId: id },
          data: { categoryId: reassignTo },
        });
        movedCount = result.count;
      }
      await tx.category.delete({ where: { id } });
      return { movedCount };
    });
  }

  /** RG-B2: a budget on a parent category counts spending across its children too. */
  async descendantIds(userId: string, categoryId: string): Promise<string[]> {
    const children = await this.prisma.category.findMany({ where: { userId, parentId: categoryId }, select: { id: true } });
    return [categoryId, ...children.map((c) => c.id)];
  }

  async reorder(userId: string, dto: ReorderCategoriesDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.category.updateMany({ where: { id, userId }, data: { sortOrder: index } }),
      ),
    );
    return this.list(userId);
  }
}
