import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupSeedService } from './group-seed.service';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { TenantModule } from '../../../../tenant/tenant.module';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { CategoryEntity } from 'src/category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupModule } from '../../../../group/group.module';
import { GroupMemberModule } from 'src/group-member/group-member.module';
import { GroupRoleModule } from 'src/group-role/group-role.module';
import { GroupRoleEntity } from 'src/group-role/infrastructure/persistence/relational/entities/group-role.entity';

@Module({
  imports: [
    TenantModule,
    GroupModule,
    GroupRoleModule,
    GroupMemberModule,
    TypeOrmModule.forFeature([
      GroupEntity,
      UserEntity,
      CategoryEntity,
      GroupRoleEntity,
    ]),
  ],
  providers: [GroupSeedService],
  exports: [GroupSeedService],
})
export class GroupSeedModule {}
