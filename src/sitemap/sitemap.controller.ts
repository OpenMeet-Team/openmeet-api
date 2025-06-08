import { Controller, Get, Res, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { SitemapService } from './sitemap.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Sitemap')
@Controller('sitemap')
export class SitemapController {
  constructor(private readonly sitemapService: SitemapService) {}

  @Get('sitemap.xml')
  @Public()
  @ApiOperation({
    summary: 'Generate XML sitemap for public events and groups',
    description:
      'Returns an XML sitemap containing all public events and groups for search engine indexing',
  })
  @ApiResponse({
    status: 200,
    description: 'XML sitemap content',
    content: {
      'application/xml': {
        example:
          '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">...</urlset>',
      },
    },
  })
  async getSitemap(@Res() res: Response, @Req() req: Request): Promise<void> {
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const urls = await this.sitemapService.generateSitemapUrls(baseUrl);
    const xml = this.sitemapService.generateXmlSitemap(urls);

    res.set({
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    });

    res.send(xml);
  }
}
