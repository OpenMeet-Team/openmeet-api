import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from '../group-members/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupMemberController } from './group-members.controller';
import { GroupMemberService } from './group-members.service';
import { GroupEntity } from '../groups/infrastructure/persistence/relational/entities/group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GroupEntity, GroupMemberEntity])],
  controllers: [GroupMemberController],
  providers: [GroupMemberService, TenantConnectionService],
  exports: [GroupMemberService],
})
export class GroupMemberModule {}
