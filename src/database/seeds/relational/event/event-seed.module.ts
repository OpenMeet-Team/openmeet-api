import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from '../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventSeedService } from './event-seed.service';
import { TenantModule } from '../../../../tenant/tenant.module';
import { EventModule } from '../../../../event/event.module';

@Module({
  imports: [TenantModule, EventModule, TypeOrmModule.forFeature([EventEntity])],
  providers: [EventSeedService],
  exports: [EventSeedService],
})
export class EventSeedModule {}
