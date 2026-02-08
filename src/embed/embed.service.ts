import { Injectable, Logger, NotFoundException, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import {
  EmbedEventDto,
  EmbedGroupEventsResponseDto,
} from './dto/embed-event.dto';
import { EventVisibility, GroupVisibility } from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST })
export class EmbedService {
  private readonly logger = new Logger(EmbedService.name);

  constructor(
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
    private readonly configService: ConfigService,
  ) {}

  async getGroupEvents(
    slug: string,
    limit: number,
  ): Promise<EmbedGroupEventsResponseDto> {
    const group = await this.groupService.findGroupBySlug(slug);

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Private groups return 404 — public and unlisted are allowed
    if (group.visibility === GroupVisibility.Private) {
      throw new NotFoundException('Group not found');
    }

    const events = await this.eventQueryService.findUpcomingEventsForGroup(
      group.id,
      limit,
    );

    // Filter out private events — keep public and unlisted
    const visibleEvents = events.filter(
      (e) => e.visibility !== EventVisibility.Private,
    );

    const frontendDomain = this.getFrontendDomain();

    const embedEvents: EmbedEventDto[] = visibleEvents.map((event) => ({
      slug: event.slug,
      name: event.name,
      description: this.stripHtml(event.description || ''),
      startDate: new Date(event.startDate).toISOString(),
      endDate: event.endDate ? new Date(event.endDate).toISOString() : null,
      timeZone: event.timeZone || 'UTC',
      location: event.location || null,
      type: event.type,
      imageUrl: this.buildImageUrl(event.image),
      url: `${frontendDomain}/events/${event.slug}`,
      attendeesCount: (event as any).attendeesCount || 0,
    }));

    return {
      group: {
        name: group.name,
        slug: group.slug,
        url: `${frontendDomain}/groups/${group.slug}`,
      },
      events: embedEvents,
      meta: {
        total: embedEvents.length,
        limit,
        platformUrl: frontendDomain,
      },
    };
  }

  private getFrontendDomain(): string {
    const frontendDomain = this.configService.get<string>(
      'app.frontendDomain',
      { infer: true },
    );
    if (!frontendDomain) {
      throw new Error('FRONTEND_DOMAIN environment variable is not configured');
    }
    return frontendDomain;
  }

  private buildImageUrl(image?: any): string | null {
    if (!image?.path) return null;

    const cloudfrontDomain = this.configService.get<string>(
      'file.cloudfrontDistributionDomain',
      { infer: true },
    );
    const fileDriver = this.configService.get<string>('file.driver', {
      infer: true,
    });

    if (fileDriver === 'cloudfront' && cloudfrontDomain) {
      return `https://${cloudfrontDomain}/${image.path}`;
    }

    const backendDomain = this.configService.get<string>('app.backendDomain', {
      infer: true,
    });
    const separator = image.path.startsWith('/') ? '' : '/';
    return `${backendDomain}${separator}${image.path}`;
  }

  private stripHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
