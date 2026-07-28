import { Injectable } from '@nestjs/common';
import { TagsService } from './tags.service';

/** Public interface of the `tags` module (docs/02-architecture.md §4) — consumed by `transactions`. */
@Injectable()
export class TagsFacade {
  constructor(private readonly tagsService: TagsService) {}

  getById(userId: string, id: string) {
    return this.tagsService.getById(userId, id);
  }

  list(userId: string) {
    return this.tagsService.list(userId);
  }
}
