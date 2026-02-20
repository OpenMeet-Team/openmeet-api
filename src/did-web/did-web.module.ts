import { Module } from '@nestjs/common';
import { DidWebController } from './did-web.controller';

@Module({
  controllers: [DidWebController],
})
export class DidWebModule {}
