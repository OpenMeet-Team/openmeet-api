import { Module } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { GroupModule } from '../groups/groups.module';

@Module({
  imports: [ConfigModule, UsersModule, GroupModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
