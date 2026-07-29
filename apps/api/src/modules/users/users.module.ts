import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersFacade } from './users.facade';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersFacade],
  exports: [UsersFacade],
})
export class UsersModule {}
