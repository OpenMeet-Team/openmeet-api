import { Module } from '@nestjs/common';

import { UserController } from './user.controller';

import { UserService } from './user.service';
import { FilesModule } from '../file/file.module';
import { TenantModule } from '../tenant/tenant.module';
import { RelationalUserPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { RoleModule } from '../role/role.module';
import { UserCreatedListener } from './user-created.listener';
import { EventEmitter2 } from '@nestjs/event-emitter';

const infrastructurePersistenceModule = RelationalUserPersistenceModule;

@Module({
  imports: [
    infrastructurePersistenceModule,
    FilesModule,
    TenantModule,
    RoleModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    SubCategoryService,
    UserCreatedListener,
    EventEmitter2,
  ],
  exports: [UserService, infrastructurePersistenceModule],
})
export class UsersModule {}
