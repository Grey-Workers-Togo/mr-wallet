import { Injectable } from '@nestjs/common';
import { CategoriesService } from './categories.service';

/** Public interface of the `categories` module (docs/02-architecture.md §4) — consumed by `transactions`, `budgets`. */
@Injectable()
export class CategoriesFacade {
  constructor(private readonly categoriesService: CategoriesService) {}

  getById(userId: string, id: string) {
    return this.categoriesService.getById(userId, id);
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
}
