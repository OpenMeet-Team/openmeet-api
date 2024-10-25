import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupSeedService } from './group-seed.service';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { TenantModule } from 'src/tenant/tenant.module';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { CategoryEntity } from 'src/category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupModule } from 'src/group/group.module';

@Module({
  imports: [
    TenantModule,
    GroupModule,
    TypeOrmModule.forFeature([GroupEntity, UserEntity, CategoryEntity]),
  ],
  providers: [GroupSeedService],
  exports: [GroupSeedService],
})
export class GroupSeedModule {}
