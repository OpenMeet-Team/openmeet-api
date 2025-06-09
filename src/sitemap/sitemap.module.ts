import { Module } from '@nestjs/common';
import { SitemapController } from './sitemap.controller';
import { SitemapService } from './sitemap.service';
import { EventModule } from '../event/event.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [EventModule, GroupModule],
  controllers: [SitemapController],
  providers: [SitemapService],
  exports: [SitemapService],
})
export class SitemapModule {}
