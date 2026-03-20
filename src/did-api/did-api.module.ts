import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DIDApiController } from './did-api.controller';
import { DIDApiService } from './did-api.service';
import { TenantModule } from '../tenant/tenant.module';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      EventEntity,
      EventAttendeesEntity,
    ]),
    TenantModule,
  ],
  controllers: [DIDApiController],
  providers: [DIDApiService],
})
export class DIDApiModule {}
