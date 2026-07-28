import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoriesFacade } from './categories.facade';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesFacade],
  exports: [CategoriesFacade],
})
export class CategoriesModule {}
