import { Injectable, Logger, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';

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

@Injectable({ scope: Scope.REQUEST })
export class SitemapService {
  private readonly logger = new Logger(SitemapService.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
  ) {}

  async getPublicEvents(tenantId: string): Promise<EventEntity[]> {
    // Set tenant ID on request for service layer
    this.request.tenantId = tenantId;

    // SEO-focused filters: only upcoming events in next 6 months
    const now = new Date();
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    // Format dates as YYYY-MM-DD as expected by the DTO
    const fromDate = now.toISOString().split('T')[0];
    const toDate = sixMonthsFromNow.toISOString().split('T')[0];

    // Use the event query service to get filtered public events
    const queryEventDto = {
      fromDate,
      toDate,
      includeRecurring: true,
      expandRecurring: false,
    } as any; // Type assertion to avoid DTO validation issues
    
    const result = await this.eventQueryService.showAllEvents(
      { page: 1, limit: 1000 }, // Reasonable limit for SEO
      queryEventDto,
      undefined, // No user (public access)
    );

    // Filter events to only include those with 5+ attendees
    const events = result.data || [];
    return events.filter((event: any) => {
      return (event.attendeesCount || 0) >= 5;
    });
  }

  async getPublicGroups(tenantId: string): Promise<GroupEntity[]> {
    // Set tenant ID on request for service layer
    this.request.tenantId = tenantId;

    // Use the group service to get public groups
    const queryGroupDto = {} as any; // Type assertion to avoid DTO validation issues
    
    const result = await this.groupService.showAll(
      { page: 1, limit: 1000 }, // Reasonable limit for SEO
      queryGroupDto,
      undefined, // No user (public access)
    );

    // Filter groups to only include active ones (with 3+ members)
    const groups = result.data || [];
    return groups.filter((group: any) => {
      return (group.groupMembersCount || 0) >= 3;
    });
  }

  generateSitemapUrls(
    baseUrl: string,
    tenantId?: string,
  ): Promise<SitemapUrl[]> {
    return this.generateSitemapUrlsInternal(baseUrl, tenantId);
  }

  private async generateSitemapUrlsInternal(
    baseUrl: string,
    tenantId?: string,
  ): Promise<SitemapUrl[]> {
    const urls: SitemapUrl[] = [];

    try {
      // Only include events and groups if a tenant ID is provided
      if (tenantId) {
        // Add public events for the specific tenant
        const events = await this.getPublicEvents(tenantId);
        for (const event of events) {
          urls.push({
            loc: `${baseUrl}/events/${event.slug}`,
            lastmod: event.updatedAt?.toISOString(),
            changefreq: this.getEventChangeFreq(event.startDate),
            priority: this.getEventPriority(event.startDate),
          });
        }

        // Add public groups for the specific tenant
        const groups = await this.getPublicGroups(tenantId);
        for (const group of groups) {
          urls.push({
            loc: `${baseUrl}/groups/${group.slug}`,
            lastmod: group.updatedAt?.toISOString(),
            changefreq: 'weekly',
            priority: '0.8',
          });
        }
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
