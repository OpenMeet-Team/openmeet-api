import { Module } from '@nestjs/common';
import { EventModule } from '../event/event.module';
import { MeController } from './me.controller';

@Module({
  imports: [EventModule],
  controllers: [MeController],
})
export class MeModule {}
