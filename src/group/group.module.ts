import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { CategoryService } from '../category/category.service';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './infrastructure/persistence/relational/entities/group-user-permission.entity';
import { UserModule } from '../user/user.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { EventService } from '../event/event.service';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { FileEntity } from '../file/infrastructure/persistence/relational/entities/file.entity';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      GroupUserPermissionEntity,
      FileEntity,
    ]),
    UserModule,
    GroupMemberModule,
    EventAttendeeModule,
  ],
  controllers: [GroupController],
  providers: [
    GroupService,
    TenantConnectionService,
    CategoryService,
    EventService,
    FilesS3PresignedService,
  ],
  exports: [GroupService],
})
export class GroupModule {}
