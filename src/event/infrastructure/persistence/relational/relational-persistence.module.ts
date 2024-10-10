import { Module } from '@nestjs/common';
import { EventRepository } from '../../../../events/infrastructure/persistence/relational/repositories/event.repository';
import { EventsRelationalRepository } from './repositories/event.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './entities/events.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity])],
  providers: [
    {
      provide: EventRepository,
      useClass: EventsRelationalRepository,
    },
  ],
  exports: [EventRepository],
})
export class RelationalUserPersistenceModule {}
