import { Injectable } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

/** Public interface of the `categories` module (docs/02-architecture.md §4) — consumed by `transactions`, `budgets`, `sync`. */
@Injectable()
export class CategoriesFacade {
  constructor(private readonly categoriesService: CategoriesService) {}

  getById(userId: string, id: string) {
    return this.categoriesService.getById(userId, id);
  }

  findSystemByKey(userId: string, i18nKey: string) {
    return this.categoriesService.findSystemByKey(userId, i18nKey);
  }

  create(userId: string, dto: CreateCategoryDto) {
    return this.categoriesService.create(userId, dto);
  }

  update(userId: string, id: string, dto: UpdateCategoryDto) {
    return this.categoriesService.update(userId, id, dto);
  }

  remove(userId: string, id: string, reassignTo?: string) {
    return this.categoriesService.remove(userId, id, reassignTo);
  }

  seedSystemDefaults(userId: string) {
    return this.categoriesService.seedSystemDefaults(userId);
  }

  list(userId: string) {
    return this.categoriesService.list(userId);
  }

  resolveName(category: { name: string | null; i18nKey: string | null }, locale: 'fr' | 'en') {
    return this.categoriesService.resolveName(category, locale);
  }

  descendantIds(userId: string, categoryId: string) {
    return this.categoriesService.descendantIds(userId, categoryId);
  }
}
