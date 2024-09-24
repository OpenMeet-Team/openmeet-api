import { Module } from '@nestjs/common';
import { EventController } from './events.controller';
import { EventService } from './events.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infrastructure/persistence/relational/entities/events.entity';
import { TenantModule } from '../tenant/tenant.module';


@Module({
  imports: [TypeOrmModule.forFeature([EventEntity]), TenantModule],
  controllers: [EventController],
  providers: [EventService],
  exports: [EventService],
})
export class EventsModule {}
