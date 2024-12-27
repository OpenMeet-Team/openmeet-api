import { Module } from '@nestjs/common';
import { ZulipService } from './zulip.service';
import { UserService } from '../user/user.service';
import { TenantModule } from '../tenant/tenant.module';
import { SubCategoryModule } from '../sub-category/sub-category.module';
import { RoleModule } from '../role/role.module';
import { FilesS3PresignedModule } from '../file/infrastructure/uploader/s3-presigned/file.module';

@Module({
  imports: [
    TenantModule,
    SubCategoryModule,
    RoleModule,
    FilesS3PresignedModule,
  ],
  providers: [ZulipService, UserService],
  exports: [ZulipService],
})
export class ZulipModule {}
