import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { EmbedService } from './embed.service';
import { EmbedGroupEventsQueryDto } from './dto/embed-group-events-query.dto';
import * as fs from 'fs';
import * as path from 'path';

@Controller('embed')
export class EmbedController {
  private readonly logger = new Logger(EmbedController.name);
  private static widgetJsCache: string | null = null;

  constructor(private readonly embedService: EmbedService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('groups/:slug/events')
  async getGroupEvents(
    @Param('slug') slug: string,
    @Query() query: EmbedGroupEventsQueryDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    try {
      const limit = query.limit ?? 5;
      const result = await this.embedService.getGroupEvents(slug, limit);

      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      });

      res.json(result);
    } catch (error) {
      if (error?.status === HttpStatus.NOT_FOUND) {
        res.status(HttpStatus.NOT_FOUND).json({ message: 'Group not found' });
        return;
      }
      this.logger.error(
        `Error fetching embed events for group ${slug}:`,
        error,
      );
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: 'Internal server error' });
    }
  }

  @Public()
  @TenantPublic()
  @Get('widget.js')
  getWidgetJs(@Res({ passthrough: false }) res: Response): void {
    try {
      if (!EmbedController.widgetJsCache) {
        const widgetPath = path.join(
          process.cwd(),
          'dist',
          'embed-widget',
          'widget.js',
        );
        EmbedController.widgetJsCache = fs.readFileSync(widgetPath, 'utf-8');
      }

      res.set({
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
      });

      res.send(EmbedController.widgetJsCache);
    } catch (error) {
      this.logger.error('Error serving widget.js:', error);
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('// Widget unavailable');
    }
  }
}
