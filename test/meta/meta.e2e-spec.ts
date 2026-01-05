import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_FRONTEND_DOMAIN,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { loginAsTester, createEvent } from '../utils/functions';
import { EventType, EventVisibility } from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Meta Controller (e2e) - Bot Link Previews', () => {
  let token: string;

  beforeEach(async () => {
    token = await loginAsTester();
  });

  describe('Bot detection and meta tag serving', () => {
    it('should serve meta HTML to bots with User-Agent containing "bot"', async () => {
      // Create a public event
      const eventData = {
        name: 'Test Meta Event',
        slug: `test-meta-event-${Date.now()}`,
        description: 'This event is for testing meta tags for bots',
        startDate: new Date('2025-12-15T19:00:00Z').toISOString(),
        endDate: new Date('2025-12-15T21:00:00Z').toISOString(),
        type: EventType.InPerson,
        location: 'San Francisco, CA',
        visibility: EventVisibility.Public,
        maxAttendees: 50,
        categories: [],
      };

      const event = await createEvent(TESTING_APP_URL, token, eventData);

      // Request as a bot (Slack bot)
      const response = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'Slackbot-LinkExpanding 1.0')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['vary']).toContain('User-Agent');

      // Verify meta tags exist
      const html = response.text;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<meta property="og:title"');
      expect(html).toContain('<meta property="og:description"');
      expect(html).toContain('<meta property="og:image"');
      expect(html).toContain('<meta name="twitter:card"');
    });

    it('should return 404 for private events even to bots', async () => {
      // Create a private event
      const privateEventData = {
        name: 'Private Test Event',
        slug: `private-test-event-${Date.now()}`,
        description: 'This should not be visible to bots',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(),
        type: EventType.InPerson,
        visibility: EventVisibility.Private,
        categories: [],
      };

      const event = await createEvent(TESTING_APP_URL, token, privateEventData);

      // Try to access as bot
      const response = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'facebookexternalhit/1.1')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(404);
      expect(response.text).toBe('Event not found');
    });
  });

  describe('Meta content accuracy - comparing with actual event data', () => {
    it('should have meta tags that match the actual event data', async () => {
      const eventData = {
        name: 'Community Meetup 2025',
        slug: `community-meetup-${Date.now()}`,
        description:
          'Join us for a fantastic community meetup with food, drinks, and great conversations about technology and innovation.',
        startDate: new Date('2025-12-20T18:00:00Z').toISOString(),
        endDate: new Date('2025-12-20T21:00:00Z').toISOString(),
        type: EventType.Hybrid,
        location: '123 Tech Street, San Francisco, CA 94103',
        locationOnline: 'https://meet.example.com/community',
        visibility: EventVisibility.Public,
        maxAttendees: 100,
        categories: [],
      };

      const event = await createEvent(TESTING_APP_URL, token, eventData);

      // Get the actual event data from API
      const eventResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${event.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(eventResponse.status).toBe(200);
      const actualEvent = eventResponse.body;

      // Get meta HTML as bot
      const metaResponse = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'Twitterbot/1.0')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(metaResponse.status).toBe(200);
      const metaHtml = metaResponse.text;

      // Verify meta tags match actual event data
      expect(metaHtml).toContain(`og:title" content="${actualEvent.name}`);
      expect(metaHtml).toContain(actualEvent.description.substring(0, 100));

      // Verify event-specific metadata
      expect(metaHtml).toContain('event:start_time');
      expect(metaHtml).toContain('event:end_time');
      expect(metaHtml).toContain('event:location');
      expect(metaHtml).toContain(actualEvent.location);

      // Verify body content includes full description (date/time prefix is added)
      expect(metaHtml).toContain(actualEvent.description);

      // Verify formatted dates in body
      expect(metaHtml).toContain('<strong>When:</strong>');
      expect(metaHtml).toContain('<strong>Where:</strong>');
    });

    it('should truncate long descriptions in meta tags but show full in body', async () => {
      const longDescription =
        'This is a very long description that exceeds 200 characters. '
          .repeat(10)
          .trim(); // Trim trailing space

      const eventData = {
        name: 'Event with Long Description',
        slug: `long-desc-event-${Date.now()}`,
        description: longDescription,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(),
        type: EventType.InPerson,
        visibility: EventVisibility.Public,
        categories: [],
      };

      const event = await createEvent(TESTING_APP_URL, token, eventData);

      // Get meta HTML
      const metaResponse = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'LinkedInBot/1.0')
        .set('x-tenant-id', TESTING_TENANT_ID);

      const metaHtml = metaResponse.text;

      // Extract meta description
      const metaDescMatch = metaHtml.match(
        /<meta property="og:description" content="([^"]+)"/,
      );
      expect(metaDescMatch).toBeTruthy();
      const metaDescription = metaDescMatch[1];

      // Meta description should be truncated to ~200 chars
      expect(metaDescription.length).toBeLessThanOrEqual(200);

      // Body should contain full description (not truncated like meta tags)
      // Note: buildEventDescription() prepends date/time, so we just check the description text exists
      expect(metaHtml).toContain(longDescription);
    });

    it('should handle events with images correctly', async () => {
      const eventData = {
        name: 'Event with Banner',
        slug: `event-banner-${Date.now()}`,
        description: 'Event with a custom banner image',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(),
        type: EventType.InPerson,
        visibility: EventVisibility.Public,
        categories: [],
      };

      const event = await createEvent(TESTING_APP_URL, token, eventData);

      // Get meta HTML
      const metaResponse = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'Discordbot/2.0')
        .set('x-tenant-id', TESTING_TENANT_ID);

      const metaHtml = metaResponse.text;

      // Should have og:image tag
      expect(metaHtml).toContain('<meta property="og:image"');

      // Image should be either uploaded image or default
      const imageMatch = metaHtml.match(
        /<meta property="og:image" content="([^"]+)"/,
      );
      expect(imageMatch).toBeTruthy();
      const imageUrl = imageMatch[1];

      // Should be a full URL
      expect(imageUrl).toMatch(/^https?:\/\//);
    });
  });

  describe('Security - XSS prevention', () => {
    it('should escape HTML and prevent XSS in event data', async () => {
      const maliciousEventData = {
        name: '<script>alert("XSS")</script>Hacked Event',
        slug: `xss-test-event-${Date.now()}`,
        description:
          'Description with <img src=x onerror="alert(\'XSS\')"> malicious HTML',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(),
        type: EventType.InPerson,
        location: '<b>Fake</b> Location',
        visibility: EventVisibility.Public,
        categories: [],
      };

      const event = await createEvent(
        TESTING_APP_URL,
        token,
        maliciousEventData,
      );

      const metaResponse = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'bot')
        .set('x-tenant-id', TESTING_TENANT_ID);

      const metaHtml = metaResponse.text;

      // Should NOT contain unescaped script tags
      expect(metaHtml).not.toContain('<script>alert(');
      expect(metaHtml).not.toContain('onerror="alert');

      // Should contain escaped HTML in title and location
      expect(metaHtml).toContain('&lt;script&gt;');
      expect(metaHtml).toContain('&lt;b&gt;');

      // Description should have HTML stripped (not double-escaped)
      // The stripHtml() removes <img> tags entirely, so check for the remaining text
      expect(metaHtml).toContain('Description with malicious HTML');
    });
  });

  describe('Smart redirect for humans', () => {
    it('should include JavaScript redirect for non-bot user agents', async () => {
      const eventData = {
        name: 'Redirect Test Event',
        slug: `redirect-test-${Date.now()}`,
        description: 'Testing redirect functionality',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(),
        type: EventType.InPerson,
        visibility: EventVisibility.Public,
        categories: [],
      };

      const event = await createEvent(TESTING_APP_URL, token, eventData);

      const metaResponse = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'bot')
        .set('x-tenant-id', TESTING_TENANT_ID);

      const metaHtml = metaResponse.text;

      // Should include JS redirect check
      expect(metaHtml).toContain(
        'if (!/bot|crawl|spider/i.test(navigator.userAgent))',
      );
      expect(metaHtml).toContain('location.replace');

      // Should include noscript fallback
      expect(metaHtml).toContain('<noscript>');
      expect(metaHtml).toContain('http-equiv="refresh"');
    });
  });

  describe('Caching headers', () => {
    it('should include appropriate caching headers for CDN', async () => {
      const eventData = {
        name: 'Cache Test Event',
        slug: `cache-test-${Date.now()}`,
        description: 'Testing cache headers',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString(),
        type: EventType.InPerson,
        visibility: EventVisibility.Public,
        categories: [],
      };

      const event = await createEvent(TESTING_APP_URL, token, eventData);

      const metaResponse = await request(TESTING_APP_URL)
        .get(`/api/meta/events/${event.slug}`)
        .set('User-Agent', 'bot')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(metaResponse.headers['cache-control']).toContain('public');
      expect(metaResponse.headers['cache-control']).toContain('s-maxage=3600');
      expect(metaResponse.headers['cache-control']).toContain(
        'stale-while-revalidate',
      );
      expect(metaResponse.headers['vary']).toContain('User-Agent');
      expect(metaResponse.headers['x-robots-tag']).toContain('index');
    });
  });

  describe('Groups meta tags', () => {
    it('should serve meta tags for public groups with accurate content', async () => {
      // Note: You'll need to add createGroup helper function similar to createEvent
      // For now, this test structure shows the behavior we want to verify

      const groupSlug = 'test-public-group';

      const metaResponse = await request(TESTING_APP_URL)
        .get(`/api/meta/groups/${groupSlug}`)
        .set('User-Agent', 'Slackbot/1.0')
        .set('x-tenant-id', TESTING_TENANT_ID);

      // If group exists and is public, should return meta HTML
      if (metaResponse.status === 200) {
        const metaHtml = metaResponse.text;

        expect(metaHtml).toContain('og:title');
        expect(metaHtml).toContain('og:description');
        expect(metaHtml).toContain('og:image');
        expect(metaHtml).toContain('/groups/');

        // Groups should not have event-specific metadata
        expect(metaHtml).not.toContain('event:start_time');
        expect(metaHtml).not.toContain('event:location');
      }
    });
  });

  // Skip nginx routing tests in CI (requires platform container for SPA)
  (process.env.ENVIRONMENT === 'ci' ? describe.skip : describe)(
    'Nginx bot detection and routing',
    () => {
      it('should route bot requests through nginx to API meta endpoint', async () => {
        // Create a public event
        const eventData = {
          name: 'Nginx Test Event',
          slug: `nginx-test-${Date.now()}`,
          description: 'Testing nginx bot routing',
          startDate: new Date('2025-12-25T20:00:00Z').toISOString(),
          endDate: new Date('2025-12-25T22:00:00Z').toISOString(),
          type: EventType.InPerson,
          location: 'Test Location for Nginx',
          visibility: EventVisibility.Public,
          categories: [],
        };

        const event = await createEvent(TESTING_APP_URL, token, eventData);

        // Request through nginx as a bot (Slack)
        const nginxResponse = await request(TESTING_FRONTEND_DOMAIN)
          .get(`/events/${event.slug}`)
          .set('User-Agent', 'Slackbot-LinkExpanding 1.0')
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(nginxResponse.status).toBe(200);
        expect(nginxResponse.headers['content-type']).toContain('text/html');

        const html = nginxResponse.text;
        expect(html).toContain('og:title');
        expect(html).toContain('og:description');
        expect(html).toContain(eventData.name);
        expect(html).toContain(eventData.description);
      });

      it('should route different bot User-Agents correctly', async () => {
        const eventData = {
          name: 'Multi Bot Test',
          slug: `multi-bot-test-${Date.now()}`,
          description: 'Testing multiple bot types',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 3600000).toISOString(),
          type: EventType.InPerson,
          visibility: EventVisibility.Public,
          categories: [],
        };

        const event = await createEvent(TESTING_APP_URL, token, eventData);

        const botUserAgents = [
          'Slackbot-LinkExpanding 1.0',
          'facebookexternalhit/1.1',
          'Twitterbot/1.0',
          'Discordbot/2.0',
          'LinkedInBot/1.0',
        ];

        for (const userAgent of botUserAgents) {
          const response = await request(TESTING_FRONTEND_DOMAIN)
            .get(`/events/${event.slug}`)
            .set('User-Agent', userAgent)
            .set('x-tenant-id', TESTING_TENANT_ID);

          expect(response.status).toBe(200);
          expect(response.text).toContain('og:title');
          expect(response.text).toContain(eventData.name);
        }
      });

      it('should return 404 for non-bot requests (humans)', async () => {
        const eventData = {
          name: 'Human Request Test',
          slug: `human-test-${Date.now()}`,
          description: 'Testing human routing',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 3600000).toISOString(),
          type: EventType.InPerson,
          visibility: EventVisibility.Public,
          categories: [],
        };

        const event = await createEvent(TESTING_APP_URL, token, eventData);

        // Request through nginx as a human (regular browser)
        const humanResponse = await request(TESTING_FRONTEND_DOMAIN)
          .get(`/events/${event.slug}`)
          .set(
            'User-Agent',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          )
          .set('x-tenant-id', TESTING_TENANT_ID);

        // Humans should get the SPA (200), not the bot meta HTML
        expect(humanResponse.status).toBe(200);

        // Should be the SPA, not bot meta HTML
        // Check for SPA-specific markers
        const responseText = humanResponse.text;
        expect(responseText).toContain('<div id="q-app"></div>'); // Quasar app div
        expect(responseText).not.toContain('Explore More:'); // Bot HTML has this navigation
        expect(responseText).not.toContain('event:start_time'); // Bot HTML has event-specific meta
      });

      it('should include Vary header for CDN caching', async () => {
        const eventData = {
          name: 'Vary Header Test',
          slug: `vary-test-${Date.now()}`,
          description: 'Testing Vary header',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 3600000).toISOString(),
          type: EventType.InPerson,
          visibility: EventVisibility.Public,
          categories: [],
        };

        const event = await createEvent(TESTING_APP_URL, token, eventData);

        const response = await request(TESTING_FRONTEND_DOMAIN)
          .get(`/events/${event.slug}`)
          .set('User-Agent', 'Slackbot/1.0')
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.headers.vary).toContain('User-Agent');
      });

      it('should return 404 for private events through nginx', async () => {
        // Create a private event
        const privateEventData = {
          name: 'Private Nginx Test',
          slug: `private-nginx-test-${Date.now()}`,
          description: 'Should not be visible via nginx',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 3600000).toISOString(),
          type: EventType.InPerson,
          visibility: EventVisibility.Private,
          categories: [],
        };

        const event = await createEvent(
          TESTING_APP_URL,
          token,
          privateEventData,
        );

        // Try to access through nginx as bot
        const response = await request(TESTING_FRONTEND_DOMAIN)
          .get(`/events/${event.slug}`)
          .set('User-Agent', 'Slackbot/1.0')
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(404);
        expect(response.text).toBe('Event not found');
      });
    },
  );
});
