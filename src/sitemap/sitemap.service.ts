import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import {
  EventStatus,
  EventVisibility,
  GroupVisibility,
} from '../core/constants/constant';

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  priority?: string;
}

@Injectable()
export class SitemapService {
  private readonly logger = new Logger(SitemapService.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupRepository: Repository<GroupEntity>,
  ) {}

  async getPublicEvents(): Promise<EventEntity[]> {
    return await this.eventRepository.find({
      where: {
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
      },
      select: ['slug', 'updatedAt', 'startDate'],
      order: { updatedAt: 'DESC' },
    });
  }

  async getPublicGroups(): Promise<GroupEntity[]> {
    return await this.groupRepository.find({
      where: {
        visibility: GroupVisibility.Public,
      },
      select: ['slug', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
  }

  generateSitemapUrls(baseUrl: string): Promise<SitemapUrl[]> {
    return this.generateSitemapUrlsInternal(baseUrl);
  }

  private async generateSitemapUrlsInternal(
    baseUrl: string,
  ): Promise<SitemapUrl[]> {
    const urls: SitemapUrl[] = [];

    try {
      // Add public events
      const events = await this.getPublicEvents();
      for (const event of events) {
        urls.push({
          loc: `${baseUrl}/events/${event.slug}`,
          lastmod: event.updatedAt?.toISOString(),
          changefreq: this.getEventChangeFreq(event.startDate),
          priority: this.getEventPriority(event.startDate),
        });
      }

      // Add public groups
      const groups = await this.getPublicGroups();
      for (const group of groups) {
        urls.push({
          loc: `${baseUrl}/groups/${group.slug}`,
          lastmod: group.updatedAt?.toISOString(),
          changefreq: 'weekly',
          priority: '0.8',
        });
      }

      // Add static pages
      urls.push({
        loc: `${baseUrl}/events`,
        changefreq: 'daily',
        priority: '0.9',
      });

      urls.push({
        loc: `${baseUrl}/groups`,
        changefreq: 'daily',
        priority: '0.9',
      });
    } catch (error) {
      this.logger.error('Error generating sitemap URLs:', error);
    }

    return urls;
  }

  private getEventChangeFreq(startDate: Date): 'daily' | 'weekly' | 'monthly' {
    const now = new Date();
    const eventDate = new Date(startDate);
    const daysUntilEvent = Math.ceil(
      (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilEvent <= 7) {
      return 'daily';
    } else if (daysUntilEvent <= 30) {
      return 'weekly';
    } else {
      return 'monthly';
    }
  }

  private getEventPriority(startDate: Date): string {
    const now = new Date();
    const eventDate = new Date(startDate);
    const daysUntilEvent = Math.ceil(
      (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilEvent <= 7) {
      return '1.0';
    } else if (daysUntilEvent <= 30) {
      return '0.9';
    } else if (daysUntilEvent <= 90) {
      return '0.8';
    } else {
      return '0.7';
    }
  }

  generateXmlSitemap(urls: SitemapUrl[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const url of urls) {
      xml += '  <url>\n';
      xml += `    <loc>${this.escapeXml(url.loc)}</loc>\n`;

      if (url.lastmod) {
        xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
      }

      if (url.changefreq) {
        xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
      }

      if (url.priority) {
        xml += `    <priority>${url.priority}</priority>\n`;
      }

      xml += '  </url>\n';
    }

    xml += '</urlset>';
    return xml;
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
