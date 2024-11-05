import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { GroupMemberService } from './group-member.service';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupRoleModule } from '../group-role/group-role.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GroupEntity, GroupMemberEntity]),
    GroupRoleModule,
  ],
  controllers: [],
  providers: [GroupMemberService, TenantConnectionService],
  exports: [GroupMemberService],
})
export class GroupMemberModule {}
