import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { GroupMemberService } from './group-member.service';
import { GroupMemberQueryService } from './group-member-query.service';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupRoleModule } from '../group-role/group-role.module';
// ChatModule removed - Matrix Application Service handles room operations directly

@Module({
  imports: [
    TypeOrmModule.forFeature([GroupEntity, GroupMemberEntity]),
    GroupRoleModule,
    // ChatModule removed - Matrix Application Service handles room operations directly
  ],
  controllers: [],
  providers: [
    GroupMemberService,
    GroupMemberQueryService,
    TenantConnectionService,
  ],
  exports: [GroupMemberService, GroupMemberQueryService],
})
export class GroupMemberModule {}
