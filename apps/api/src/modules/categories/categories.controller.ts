import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  createCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.categoriesService.list(user.id);
  }

  @Get(':id')
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.categoriesService.getById(user.id, id);
  }

  @Post()
  @Audit({ action: 'category.create', entityType: 'Category' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.id, dto);
  }

  @Patch(':id')
  @Audit({ action: 'category.update', entityType: 'Category' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @Audit({ action: 'category.delete', entityType: 'Category' })
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string, @Query('reassignTo') reassignTo?: string) {
    return this.categoriesService.remove(user.id, id, reassignTo);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'category.reorder', entityType: 'Category' })
  reorder(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(reorderCategoriesSchema)) dto: ReorderCategoriesDto,
  ) {
    return this.categoriesService.reorder(user.id, dto);
  }
}
