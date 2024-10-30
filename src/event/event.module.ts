import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { TenantModule } from '../tenant/tenant.module';
import { CategoryModule } from '../category/category.module';
import { AuthModule } from '../auth/auth.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { ChannelCreatedListener } from './channel-created.listener';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMemberModule } from '../group-member/group-member.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    TenantModule,
    GroupMemberModule,
    CategoryModule,
    AuthModule,
    EventAttendeeModule,
  ],
  controllers: [EventController],
  providers: [EventService, ChannelCreatedListener, EventEmitter2],
  exports: [EventService],
})
export class EventsModule {}
