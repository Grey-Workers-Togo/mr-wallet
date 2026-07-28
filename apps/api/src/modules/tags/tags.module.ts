import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { TagsFacade } from './tags.facade';

@Module({
  controllers: [TagsController],
  providers: [TagsService, TagsFacade],
  exports: [TagsFacade],
})
export class TagsModule {}
