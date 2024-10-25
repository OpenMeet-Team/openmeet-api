import { Module } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { EventsModule } from 'src/event/event.module';
import { CategoryModule } from 'src/category/category.module';
import { SubCategoryModule } from 'src/sub-category/sub-category.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    GroupModule,
    EventsModule,
    CategoryModule,
    SubCategoryModule,
  ],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
