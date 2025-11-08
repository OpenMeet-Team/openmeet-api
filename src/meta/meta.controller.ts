import {
  Controller,
  Get,
  Param,
  Res,
  HttpStatus,
  Injectable,
  Scope,
  Inject,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import { EventVisibility, GroupVisibility } from '../core/constants/constant';

/**
 * Meta Controller
 *
 * Serves Open Graph meta tags for PUBLIC bot crawlers (Slack, Discord, Twitter, etc.)
 *
 * Security: Only serves meta tags for PUBLIC events/groups.
 * Private/Authenticated events return 404 to avoid information leakage.
 *
 * Architecture: Used with nginx bot detection (see design-notes/link-preview-meta-tags.md)
 * - Nginx detects bots via User-Agent and proxies to this controller
 * - Nginx serves static files directly to humans (they never hit this controller)
 */
@Controller('meta')
@Injectable({ scope: Scope.REQUEST })
export class MetaController {
  private readonly logger = new Logger(MetaController.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly configService: ConfigService,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
  ) {}

  /**
   * Get frontend domain from config, throw if not set
   */
  private getFrontendDomain(): string {
    const frontendDomain = this.configService.get<string>('FRONTEND_DOMAIN');
    if (!frontendDomain) {
      throw new Error('FRONTEND_DOMAIN environment variable is not configured');
    }
    return frontendDomain;
  }

  /**
   * Strip HTML tags from text
   * Used for descriptions that may contain HTML (like group descriptions)
   */
  private stripHtml(html: string): string {
    if (!html) return '';
    // Remove HTML tags, decode entities, and clean up whitespace
    return html
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&lt;/g, '<') // Decode common entities
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Escape HTML to prevent XSS attacks
   * Critical security measure when rendering user-generated content
   */
  private escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Render meta HTML for bot crawlers
   */
  private renderMetaHTML(type: 'event' | 'group', data: any): string {
    const title = this.escapeHtml(data.name || data.title || 'OpenMeet Event');

    // Strip HTML tags first (for group descriptions), then escape for safety
    const rawDescription = data.description || '';
    const strippedDescription = this.stripHtml(rawDescription);
    const fullDescription = this.escapeHtml(strippedDescription);
    const metaDescription = fullDescription.slice(0, 200); // Truncate for meta tags (OG standard)

    const frontendDomain = this.getFrontendDomain();

    // Construct the full image URL from FileEntity
    // When file driver is CLOUDFRONT, the path contains just the S3 key (tenant-id/filename.png)
    // We need to manually construct the full CloudFront URL
    const imagePath = data.image?.path;
    let image: string;

    if (imagePath) {
      // Get CloudFront distribution domain from config
      const cloudfrontDomain = this.configService.get<string>('file.cloudfrontDistributionDomain');
      const fileDriver = this.configService.get<string>('file.driver');

      if (fileDriver === 'cloudfront' && cloudfrontDomain) {
        // CloudFront: construct full URL with distribution domain
        image = `https://${cloudfrontDomain}/${imagePath}`;
      } else {
        // Fallback: use backend domain (for local or S3 presigned)
        const backendDomain = this.configService.get<string>('app.backendDomain');
        image = `${backendDomain}${imagePath}`;
      }
    } else {
      // No image: use default
      image = `${frontendDomain}/default-og.jpg`;
    }

    const url = `${frontendDomain}/${type}s/${data.slug}`;

    // LinkedIn and additional metadata
    let additionalMeta = '';
    let eventDetails = '';

    // Author information (for LinkedIn and attribution)
    if (data.user?.firstName && data.user?.lastName) {
      const authorName = this.escapeHtml(`${data.user.firstName} ${data.user.lastName}`);
      additionalMeta += `<meta property="article:author" content="${authorName}" />\n`;
    } else if (data.createdBy?.firstName && data.createdBy?.lastName) {
      const authorName = this.escapeHtml(`${data.createdBy.firstName} ${data.createdBy.lastName}`);
      additionalMeta += `<meta property="article:author" content="${authorName}" />\n`;
    }

    // Article published time (when the event/group was created on the platform)
    if (data.createdAt) {
      const publishedTime = new Date(data.createdAt).toISOString();
      additionalMeta += `<meta property="article:published_time" content="${publishedTime}" />\n`;
    }

    // Event-specific metadata
    if (type === 'event') {
      if (data.startDate) {
        const startDate = new Date(data.startDate).toISOString();
        additionalMeta += `<meta property="event:start_time" content="${startDate}" />\n`;

        // Format readable date/time for body
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        });
        const formattedStart = dateFormatter.format(new Date(data.startDate));
        eventDetails += `<p><strong>When:</strong> ${formattedStart}`;

        if (data.endDate) {
          const endDate = new Date(data.endDate).toISOString();
          additionalMeta += `<meta property="event:end_time" content="${endDate}" />\n`;
          const formattedEnd = dateFormatter.format(new Date(data.endDate));
          eventDetails += ` - ${formattedEnd}`;
        }
        eventDetails += `</p>\n`;
      }
      if (data.location) {
        const location = this.escapeHtml(data.location);
        additionalMeta += `<meta property="event:location" content="${location}" />\n`;
        eventDetails += `<p><strong>Where:</strong> ${location}</p>\n`;
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - OpenMeet</title>

<!-- Open Graph -->
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${metaDescription}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="OpenMeet" />
<meta property="og:locale" content="en_US" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${metaDescription}" />
<meta name="twitter:image" content="${image}" />

<!-- Standard SEO -->
<meta name="description" content="${metaDescription}" />
<link rel="canonical" href="${url}" />

<!-- Event-specific metadata -->
${additionalMeta}

<!-- Smart Redirect for humans who land here -->
<script>
if (!/bot|crawl|spider/i.test(navigator.userAgent)) {
  location.replace("${url}");
}
</script>
<noscript><meta http-equiv="refresh" content="0;url=${url}"></noscript>
</head>
<body>
  <h1>${title}</h1>
  ${eventDetails}
  <p>${fullDescription}</p>
  <hr>
  <nav>
    <p><strong>Explore More:</strong></p>
    <ul>
      <li><a href="${frontendDomain}/">OpenMeet Home</a></li>
      <li><a href="${frontendDomain}/events">Browse Events</a></li>
      <li><a href="${frontendDomain}/groups">Browse Groups</a></li>
      ${data.group?.slug ? `<li><a href="${frontendDomain}/groups/${data.group.slug}">View Organizing Group: ${this.escapeHtml(data.group.name)}</a></li>` : ''}
    </ul>
  </nav>
</body>
</html>`;
  }

  /**
   * Handle event meta tag requests
   * GET /events/:slug
   *
   * Security: Only returns meta tags for PUBLIC events.
   * Private/Authenticated events return 404 to prevent information leakage.
   */
  @Get('events/:slug')
  async getEventMeta(
    @Param('slug') slug: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    try {
      const event = await this.eventQueryService.findEventBySlug(slug);

      if (!event) {
        this.logger.warn(`Event not found: ${slug}`);
        res.status(HttpStatus.NOT_FOUND).send('Event not found');
        return;
      }

      // Security: Only serve meta tags for PUBLIC events
      if (event.visibility !== EventVisibility.Public) {
        this.logger.warn(
          `Attempted to fetch meta for non-public event: ${slug} (visibility: ${event.visibility})`,
        );
        res.status(HttpStatus.NOT_FOUND).send('Event not found');
        return;
      }

      const html = this.renderMetaHTML('event', event);

      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        Vary: 'User-Agent',
        'X-Robots-Tag': 'index, follow',
      });

      this.logger.debug(`Served meta HTML for public event: ${slug}`);
      res.send(html);
    } catch (error) {
      this.logger.error(`Error fetching event meta for ${slug}:`, error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error fetching event');
    }
  }

  /**
   * Handle group meta tag requests
   * GET /groups/:slug
   *
   * Security: Only returns meta tags for PUBLIC groups.
   * Private/Authenticated groups return 404 to prevent information leakage.
   */
  @Get('groups/:slug')
  async getGroupMeta(
    @Param('slug') slug: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    try {
      const group = await this.groupService.findGroupBySlug(slug);

      if (!group) {
        this.logger.warn(`Group not found: ${slug}`);
        res.status(HttpStatus.NOT_FOUND).send('Group not found');
        return;
      }

      // Security: Only serve meta tags for PUBLIC groups
      if (group.visibility !== GroupVisibility.Public) {
        this.logger.warn(
          `Attempted to fetch meta for non-public group: ${slug} (visibility: ${group.visibility})`,
        );
        res.status(HttpStatus.NOT_FOUND).send('Group not found');
        return;
      }

      const html = this.renderMetaHTML('group', group);

      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        Vary: 'User-Agent',
        'X-Robots-Tag': 'index, follow',
      });

      this.logger.debug(`Served meta HTML for public group: ${slug}`);
      res.send(html);
    } catch (error) {
      this.logger.error(`Error fetching group meta for ${slug}:`, error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error fetching group');
    }
  }
}
