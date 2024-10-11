import { Module } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [ConfigModule, UsersModule, GroupModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
