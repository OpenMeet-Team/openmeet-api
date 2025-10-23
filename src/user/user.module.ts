import { Module, forwardRef } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { FileModule } from '../file/file.module';
import { TenantModule } from '../tenant/tenant.module';
import { RelationalUserPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { RoleModule } from '../role/role.module';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { UserListener } from './user.listener';
import { ConfigModule } from '@nestjs/config';
import { MatrixModule } from '../matrix/matrix.module';
import { BlueskyModule } from '../bluesky/bluesky.module';

const infrastructurePersistenceModule = RelationalUserPersistenceModule;

@Module({
  imports: [
    ConfigModule,
    infrastructurePersistenceModule,
    FileModule,
    TenantModule,
    RoleModule,
    forwardRef(() => MatrixModule),
    BlueskyModule, // No forwardRef needed - BlueskyIdentityService has no circular dependency
  ],
  controllers: [UserController],
  providers: [
    UserService,
    SubCategoryService,
    UserListener,
    FilesS3PresignedService,
  ],
  exports: [UserService, infrastructurePersistenceModule],
})
export class UserModule {}
