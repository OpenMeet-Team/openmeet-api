import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';

import { UsersService } from './users.service';
import { FilesModule } from '../files/files.module';
import { TenantModule } from '../tenant/tenant.module';
import { RelationalUserPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { SubCategoryService } from '../sub-categories/sub-category.service';

const infrastructurePersistenceModule = RelationalUserPersistenceModule;

@Module({
  imports: [infrastructurePersistenceModule, FilesModule, TenantModule],
  controllers: [UsersController],
  providers: [UsersService, SubCategoryService],
  exports: [UsersService, infrastructurePersistenceModule],
})
export class UsersModule {}
