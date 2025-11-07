import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetaController } from './meta.controller';
import { EventModule } from '../event/event.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [ConfigModule, EventModule, GroupModule],
  controllers: [MetaController],
})
export class MetaModule {}
