import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbedController } from './embed.controller';
import { EmbedService } from './embed.service';
import { EventModule } from '../event/event.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [ConfigModule, EventModule, GroupModule],
  controllers: [EmbedController],
  providers: [EmbedService],
})
export class EmbedModule {}
