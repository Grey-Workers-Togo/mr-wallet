import { Injectable } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/tag.dto';

/** Public interface of the `tags` module (docs/02-architecture.md §4) — consumed by `transactions`, `sync`. */
@Injectable()
export class TagsFacade {
  constructor(private readonly tagsService: TagsService) {}

  getById(userId: string, id: string) {
    return this.tagsService.getById(userId, id);
  }

  create(userId: string, dto: CreateTagDto) {
    return this.tagsService.create(userId, dto);
  }

  remove(userId: string, id: string) {
    return this.tagsService.remove(userId, id);
  }

  list(userId: string) {
    return this.tagsService.list(userId);
  }
}
