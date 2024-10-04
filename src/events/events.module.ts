import { forwardRef, Module } from '@nestjs/common';
import { EventController } from './events.controller';
import { EventService } from './events.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infrastructure/persistence/relational/entities/events.entity';
import { TenantModule } from '../tenant/tenant.module';
import { UsersModule } from '../users/users.module';
import { GroupModule } from '../groups/groups.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    TenantModule,
    forwardRef(() => UsersModule), // Using forwardRef for circular dependency
    forwardRef(() => GroupModule), // Using forwardRef for circular dependency
  ],
  controllers: [EventController],
  providers: [EventService],
  exports: [EventService],
})
export class EventsModule {}
