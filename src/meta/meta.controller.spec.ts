import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaController } from './meta.controller';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import { EventSeriesService } from '../event-series/services/event-series.service';
import { EventVisibility, GroupVisibility } from '../core/constants/constant';
import { REQUEST } from '@nestjs/core';

describe('MetaController', () => {
  let controller: MetaController;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, _options?: any) => {
      const config = {
        'app.frontendDomain': 'https://platform.openmeet.net',
        'file.cloudfrontDistributionDomain': 'ds1xtylbemsat.cloudfront.net',
        'file.driver': 'cloudfront',
        'app.backendDomain': 'https://api.openmeet.net',
      };
      return config[key];
    }),
  };

  const mockEventQueryService = {
    findEventBySlug: jest.fn(),
  };

  const mockGroupService = {
    findGroupBySlug: jest.fn(),
  };

  const mockEventSeriesService = {
    findBySlug: jest.fn(),
  };

  const mockRequest = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventQueryService, useValue: mockEventQueryService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: EventSeriesService, useValue: mockEventSeriesService },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();

    controller = module.get<MetaController>(MetaController);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('stripHtml', () => {
    it('should remove HTML tags from group descriptions', () => {
      const input = '<div><b>OpenMeet Guides</b></div>';
      const result = controller['stripHtml'](input);
      expect(result).toBe('OpenMeet Guides');
    });

    it('should decode common HTML entities', () => {
      const input = '&lt;div&gt;&amp;&nbsp;&quot;&#039;';
      const result = controller['stripHtml'](input);
      expect(result).toBe('<div>& "\'');
    });

    it('should handle mixed HTML and entities', () => {
      const input = '<p>Hello&nbsp;<b>world</b>&lt;test&gt;</p>&amp;more';
      const result = controller['stripHtml'](input);
      expect(result).toBe('Hello world<test>&more');
    });

    it('should normalize whitespace', () => {
      const input = '<p>Too   much    space</p>\n\n<div>here</div>';
      const result = controller['stripHtml'](input);
      expect(result).toBe('Too much space here');
    });

    it('should return empty string for null/undefined', () => {
      expect(controller['stripHtml'](null as any)).toBe('');
      expect(controller['stripHtml'](undefined as any)).toBe('');
      expect(controller['stripHtml']('')).toBe('');
    });

    it('should prevent double-escaping (Issue #1 regression test)', () => {
      // This was the actual bug: descriptions stored as HTML were being escaped twice
      const storedHtml = '&lt;div&gt;&lt;b&gt;Text&lt;/b&gt;&lt;/div&gt;';
      const stripped = controller['stripHtml'](storedHtml);
      const escaped = controller['escapeHtml'](stripped);

      // stripHtml should decode entities first, so we get clean HTML tags
      expect(stripped).toBe('<div><b>Text</b></div>');
      // Then escapeHtml properly escapes them once (not double-escaped)
      expect(escaped).toBe('&lt;div&gt;&lt;b&gt;Text&lt;/b&gt;&lt;/div&gt;');
    });
  });

  describe('escapeHtml', () => {
    it('should escape dangerous characters', () => {
      const input = '<script>alert("XSS")</script>';
      const result = controller['escapeHtml'](input);
      expect(result).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
      );
    });

    it('should handle all special characters', () => {
      const input = '& < > " \'';
      const result = controller['escapeHtml'](input);
      expect(result).toBe('&amp; &lt; &gt; &quot; &#039;');
    });

    it('should return empty string for null/undefined', () => {
      expect(controller['escapeHtml'](null as any)).toBe('');
      expect(controller['escapeHtml'](undefined as any)).toBe('');
      expect(controller['escapeHtml']('')).toBe('');
    });
  });

  describe('renderMetaHTML - Image URL Construction', () => {
    it('should construct CloudFront URLs correctly for groups (Issue #2 fix)', () => {
      const cloudfrontDomain = mockConfigService.get(
        'file.cloudfrontDistributionDomain',
      );
      const frontendDomain = mockConfigService.get('app.frontendDomain');

      const mockGroup = {
        name: 'Test Group',
        slug: 'test-group',
        description: 'A test group',
        visibility: GroupVisibility.Public,
        image: {
          path: 'tenant123/abc123.png',
        },
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      // Should construct full CloudFront URL, not malformed platform.openmeet.net URL
      const expectedImageUrl = `https://${cloudfrontDomain}/tenant123/abc123.png`;
      expect(html).toContain(expectedImageUrl);
      expect(html).not.toContain(`${frontendDomain}/tenant123`);
    });

    it('should use backend domain when file driver is not cloudfront', async () => {
      // Create a separate module with different config for this test
      const localConfigService = {
        get: jest.fn((key: string, _options?: any) => {
          const config = {
            'app.frontendDomain': 'https://platform.openmeet.net',
            'file.cloudfrontDistributionDomain': null,
            'file.driver': 'local',
            'app.backendDomain': 'https://api.openmeet.net',
          };
          return config[key];
        }),
      };

      const localModule: TestingModule = await Test.createTestingModule({
        controllers: [MetaController],
        providers: [
          { provide: ConfigService, useValue: localConfigService },
          { provide: EventQueryService, useValue: mockEventQueryService },
          { provide: GroupService, useValue: mockGroupService },
          { provide: EventSeriesService, useValue: mockEventSeriesService },
          { provide: REQUEST, useValue: mockRequest },
        ],
      }).compile();

      const localController = localModule.get<MetaController>(MetaController);

      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'A test event',
        visibility: EventVisibility.Public,
        image: {
          path: '/uploads/image.jpg',
        },
      };

      const html = localController['renderMetaHTML']('event', mockEvent);

      const expectedImageUrl = 'https://api.openmeet.net/uploads/image.jpg';
      expect(html).toContain(expectedImageUrl);
    });

    it('should use default image when no image provided', () => {
      const frontendDomain = mockConfigService.get('app.frontendDomain');

      const mockGroup = {
        name: 'Test Group',
        slug: 'test-group',
        description: 'A test group',
        visibility: GroupVisibility.Public,
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      const expectedDefaultImage = `${frontendDomain}/default-og.jpg`;
      expect(html).toContain(expectedDefaultImage);
    });
  });

  describe('renderMetaHTML - Group Description Handling', () => {
    it('should strip HTML tags from group descriptions before rendering', () => {
      const mockGroup = {
        name: 'OpenMeet Guides',
        slug: 'openmeet-guides',
        description: '<div><b>OpenMeet Guides</b> contains helpful tips</div>',
        visibility: GroupVisibility.Public,
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      // Should show clean text, not HTML tags or escaped entities
      expect(html).toContain('OpenMeet Guides contains helpful tips');
      expect(html).not.toContain('&lt;div&gt;');
      expect(html).not.toContain('<div>');
      expect(html).not.toContain('&lt;b&gt;');
    });

    it('should handle plain text event descriptions without stripping', () => {
      const mockEvent = {
        name: 'Summer BBQ',
        slug: 'summer-bbq',
        description: 'Join us for grilling and games!',
        visibility: EventVisibility.Public,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain('Join us for grilling and games!');
    });
  });

  describe('renderMetaHTML - LinkedIn Tags', () => {
    it('should include article:author tag when user data is available', () => {
      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'Test description',
        visibility: EventVisibility.Public,
        user: {
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain(
        '<meta property="article:author" content="John Doe" />',
      );
    });

    it('should fallback to createdBy for groups', () => {
      const mockGroup = {
        name: 'Test Group',
        slug: 'test-group',
        description: 'Test description',
        visibility: GroupVisibility.Public,
        createdBy: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      expect(html).toContain(
        '<meta property="article:author" content="Jane Smith" />',
      );
    });

    it('should include og:locale tag', () => {
      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'Test description',
        visibility: EventVisibility.Public,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain('<meta property="og:locale" content="en_US" />');
    });

    it('should include og:site_name tag', () => {
      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'Test description',
        visibility: EventVisibility.Public,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain(
        '<meta property="og:site_name" content="OpenMeet" />',
      );
    });

    it('should include article:published_time based on createdAt', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z');
      const startDate = new Date('2025-06-14T14:00:00Z');
      const mockEvent = {
        name: 'Summer BBQ',
        slug: 'summer-bbq',
        description: 'Test event',
        visibility: EventVisibility.Public,
        createdAt,
        startDate,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Published time should be when event was created, not when it starts
      expect(html).toContain('<meta property="article:published_time"');
      expect(html).toContain('2025-01-15T10:00:00.000Z');

      // Event start time should still be the event's actual start date
      expect(html).toContain('<meta property="event:start_time"');
      expect(html).toContain('2025-06-14T14:00:00.000Z');
    });
  });

  describe('renderMetaHTML - Security', () => {
    it('should escape user-generated content to prevent XSS', () => {
      const mockEvent = {
        name: '<script>alert("XSS")</script>',
        slug: 'test-event',
        description: '<img src=x onerror=alert(1)> Some text here',
        visibility: EventVisibility.Public,
        location: '<script>alert("location")</script>',
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Should not contain unescaped script tags
      expect(html).not.toContain('<script>alert("XSS")');
      expect(html).not.toContain('<img src=x onerror');

      // Should contain escaped versions in meta tags and body
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
      );
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;location&quot;)&lt;/script&gt;',
      );

      // Description should have HTML stripped, leaving just the text
      expect(html).toContain('Some text here');
    });
  });

  describe('Event Link Previews - Bot Access Behavior', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
    });

    it('should allow bots to generate rich link previews for public events', async () => {
      const mockEvent = {
        slug: 'yoga-workshop',
        name: 'Beginner Yoga Workshop',
        description: 'Join us for a relaxing yoga session',
        visibility: EventVisibility.Public,
        location: 'Downtown Studio',
        startDate: new Date('2025-06-14T14:00:00Z'),
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('yoga-workshop', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain('Beginner Yoga Workshop');
      expect(sentHtml).toContain('Join us for a relaxing yoga session');
      expect(sentHtml).toContain('Downtown Studio');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should allow WhatsApp/Discord bots to preview authenticated (unlisted) events', async () => {
      const mockEvent = {
        slug: 'private-birthday-party',
        name: "Emma's 6th Birthday",
        description: 'Join us for cake and games!',
        visibility: EventVisibility.Unlisted,
        location: '123 Main St',
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('private-birthday-party', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      // Check for HTML-escaped version (apostrophes are escaped as &#039;)
      expect(sentHtml).toContain('Emma&#039;s 6th Birthday');
      expect(sentHtml).toContain('Join us for cake and games!');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should prevent search engines from indexing authenticated events', async () => {
      const mockEvent = {
        slug: 'semi-private-event',
        name: 'Semi-Private Event',
        description: 'Only for those with the link',
        visibility: EventVisibility.Unlisted,
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('semi-private-event', mockResponse);

      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Robots-Tag': 'noindex, nofollow',
        }),
      );
    });

    it('should allow search engines to index public events', async () => {
      const mockEvent = {
        slug: 'public-meetup',
        name: 'Public Meetup',
        description: 'Everyone welcome!',
        visibility: EventVisibility.Public,
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('public-meetup', mockResponse);

      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Robots-Tag': 'index, follow',
        }),
      );
    });

    it('should hide private events completely from bots', async () => {
      const mockEvent = {
        slug: 'secret-meeting',
        name: 'Secret Meeting',
        description: 'Top secret content',
        visibility: EventVisibility.Private,
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('secret-meeting', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Event not found');
      const sentContent = mockResponse.send.mock.calls[0][0];
      expect(sentContent).not.toContain('Secret Meeting');
      expect(sentContent).not.toContain('Top secret content');
    });

    it('should return generic 404 for non-existent events without leaking information', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValue(null);

      await controller.getEventMeta('non-existent', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Event not found');
    });
  });

  describe('Event OG Description - Date/Time/Location Enhancement (Issue #442)', () => {
    it('should include formatted date/time in og:description for events', () => {
      // Use Jan 3, 2026 which is a Saturday
      const mockEvent = {
        name: 'Monthly Meetup',
        slug: 'monthly-meetup',
        description: 'Join us for our monthly community gathering',
        visibility: EventVisibility.Public,
        startDate: new Date('2026-01-03T19:00:00Z'),
        location: 'Coffee Shop Downtown',
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // og:description should start with date/time/location before the description
      expect(html).toMatch(
        /<meta property="og:description" content="[^"]*Sat[^"]*Jan[^"]*3[^"]*Coffee Shop Downtown/,
      );
    });

    it('should include location in og:description when available', () => {
      const mockEvent = {
        name: 'Tech Talk',
        slug: 'tech-talk',
        description: 'A discussion about new technologies',
        visibility: EventVisibility.Public,
        startDate: new Date('2026-01-15T18:30:00Z'),
        location: 'Innovation Hub, 123 Main St',
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // og:description should include location
      expect(html).toMatch(
        /<meta property="og:description" content="[^"]*Innovation Hub, 123 Main St/,
      );
    });

    it('should handle events without location gracefully', () => {
      const mockEvent = {
        name: 'Online Webinar',
        slug: 'online-webinar',
        description: 'Learn about web development',
        visibility: EventVisibility.Public,
        startDate: new Date('2026-02-10T14:00:00Z'),
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Should still include date/time but skip location separator
      expect(html).toMatch(
        /<meta property="og:description" content="[^"]*Feb[^"]*10/,
      );
      // Description should still be included
      expect(html).toMatch(
        /<meta property="og:description" content="[^"]*Learn about web development/,
      );
    });

    it('should format date in a user-friendly way (e.g., "Sat, Jan 3 at 2:00 PM")', () => {
      // Use Jan 3, 2026 which is a Saturday
      const mockEvent = {
        name: 'Evening Social',
        slug: 'evening-social',
        description: 'Casual evening get-together',
        visibility: EventVisibility.Public,
        startDate: new Date('2026-01-03T19:00:00Z'),
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Should have abbreviated weekday, month, day, and time format
      // Note: exact format depends on locale, but should be readable
      expect(html).toMatch(
        /<meta property="og:description" content="[^"]*Sat[^"]*Jan[^"]*3[^"]*/,
      );
    });

    it('should not include date/time in og:description for groups', () => {
      const mockGroup = {
        name: 'Photography Club',
        slug: 'photography-club',
        description: 'For photography enthusiasts',
        visibility: GroupVisibility.Public,
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      // Group description should be the actual description, not prefixed with date
      expect(html).toMatch(
        /<meta property="og:description" content="For photography enthusiasts/,
      );
    });
  });

  describe('Group Link Previews - Bot Access Behavior', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
    });

    it('should allow bots to generate rich link previews for public groups', async () => {
      const mockGroup = {
        slug: 'photography-club',
        name: 'Photography Club',
        description: 'For photography enthusiasts',
        visibility: GroupVisibility.Public,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('photography-club', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain('Photography Club');
      expect(sentHtml).toContain('For photography enthusiasts');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should allow link preview bots to preview authenticated groups', async () => {
      const mockGroup = {
        slug: 'book-club',
        name: 'Secret Book Club',
        description: 'Monthly book discussions',
        visibility: GroupVisibility.Unlisted,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('book-club', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain('Secret Book Club');
      expect(sentHtml).toContain('Monthly book discussions');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should prevent search engines from indexing authenticated groups', async () => {
      const mockGroup = {
        slug: 'invite-only-group',
        name: 'Invite Only Group',
        description: 'Link sharing only',
        visibility: GroupVisibility.Unlisted,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('invite-only-group', mockResponse);

      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Robots-Tag': 'noindex, nofollow',
        }),
      );
    });

    it('should hide private groups completely from bots', async () => {
      const mockGroup = {
        slug: 'secret-society',
        name: 'Secret Society',
        description: 'Members only',
        visibility: GroupVisibility.Private,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('secret-society', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Group not found');
      const sentContent = mockResponse.send.mock.calls[0][0];
      expect(sentContent).not.toContain('Secret Society');
      expect(sentContent).not.toContain('Members only');
    });
  });

  describe('Event Series Link Previews (Issue #442)', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
    });

    it('should serve meta tags for event series', async () => {
      const mockSeries = {
        slug: 'weekly-yoga',
        name: 'Weekly Yoga Sessions',
        description: 'Relaxing yoga every week',
        recurrenceRule: { frequency: 'WEEKLY', byweekday: ['TU'] },
        recurrenceDescription: 'Every Tuesday',
        image: { path: 'tenant123/yoga.png' },
        user: { firstName: 'Jane', lastName: 'Doe' },
      };

      mockEventSeriesService.findBySlug.mockResolvedValue(mockSeries);

      await controller.getEventSeriesMeta('weekly-yoga', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain('Weekly Yoga Sessions');
      expect(sentHtml).toContain('Relaxing yoga every week');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should include recurrence pattern in og:description', async () => {
      const mockSeries = {
        slug: 'monthly-meetup',
        name: 'Monthly Community Meetup',
        description: 'Join us for networking and learning',
        recurrenceRule: { frequency: 'MONTHLY', interval: 1 },
        recurrenceDescription: 'Every month',
      };

      mockEventSeriesService.findBySlug.mockResolvedValue(mockSeries);

      await controller.getEventSeriesMeta('monthly-meetup', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      // og:description should include recurrence pattern
      expect(sentHtml).toMatch(
        /<meta property="og:description" content="[^"]*Every month/,
      );
    });

    it('should return 500 for errors fetching event series', async () => {
      mockEventSeriesService.findBySlug.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await controller.getEventSeriesMeta('non-existent', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.send).toHaveBeenCalledWith(
        'Error fetching event series',
      );
    });

    it('should use series image for og:image when available', async () => {
      const mockSeries = {
        slug: 'weekly-yoga',
        name: 'Weekly Yoga Sessions',
        description: 'Relaxing yoga',
        recurrenceRule: { frequency: 'WEEKLY' },
        recurrenceDescription: 'Every week',
        image: { path: 'tenant123/series-image.png' },
      };

      mockEventSeriesService.findBySlug.mockResolvedValue(mockSeries);

      await controller.getEventSeriesMeta('weekly-yoga', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain(
        'https://ds1xtylbemsat.cloudfront.net/tenant123/series-image.png',
      );
    });

    it('should use correct URL path for event-series', async () => {
      const mockSeries = {
        slug: 'weekly-yoga',
        name: 'Weekly Yoga',
        description: 'Yoga sessions',
        recurrenceRule: { frequency: 'WEEKLY' },
        recurrenceDescription: 'Every week',
      };

      mockEventSeriesService.findBySlug.mockResolvedValue(mockSeries);

      await controller.getEventSeriesMeta('weekly-yoga', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      // URL should be /event-series/slug, not /events/slug
      expect(sentHtml).toContain(
        'https://platform.openmeet.net/event-series/weekly-yoga',
      );
    });
  });

  describe('Event Timezone Formatting (Issue: UTC instead of event timezone)', () => {
    it('should display event time in the event timezone, not UTC', () => {
      // Event at 6:00 PM EST (23:00 UTC) on Jan 8, 2026
      const mockEvent = {
        name: 'Evening Meetup',
        slug: 'evening-meetup',
        description: 'Join us for an evening gathering',
        visibility: EventVisibility.Public,
        startDate: new Date('2026-01-08T23:00:00.000Z'), // 23:00 UTC = 6:00 PM EST
        timeZone: 'America/New_York',
        location: 'NYC Office',
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Should show 6:00 PM (EST time), NOT 11:00 PM (UTC time)
      expect(html).toMatch(/6:00\s*PM/i);
      expect(html).not.toMatch(/11:00\s*PM/i);
      // Should include EST timezone abbreviation
      expect(html).toMatch(/EST/);
    });

    it('should use event timezone for Pacific time events', () => {
      const mockEvent = {
        name: 'Pacific Event',
        slug: 'pacific-event',
        description: 'West coast gathering',
        visibility: EventVisibility.Public,
        startDate: new Date('2026-01-08T20:00:00.000Z'), // 20:00 UTC = 12:00 PM PST
        timeZone: 'America/Los_Angeles',
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Should show noon Pacific time (12:00 PM), not 3:00 PM EST or 8:00 PM UTC
      expect(html).toMatch(/12:00\s*PM/i);
      // Should NOT show 3:00 PM (which would be EST conversion) or 8:00 PM (UTC)
      expect(html).not.toMatch(/3:00\s*PM/i);
      expect(html).not.toMatch(/8:00\s*PM/i);
      // Should include PST timezone indicator
      expect(html).toMatch(/PST/);
    });

    it('should handle events without a timezone gracefully (fallback to UTC)', () => {
      const mockEvent = {
        name: 'Legacy Event',
        slug: 'legacy-event',
        description: 'Old event without timezone',
        visibility: EventVisibility.Public,
        startDate: new Date('2026-01-08T14:00:00.000Z'),
        // No timeZone field - should default to UTC
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Should still render without error, showing UTC time
      expect(html).toContain('Legacy Event');
      // 14:00 UTC = 2:00 PM UTC
      expect(html).toMatch(/2:00\s*PM/i);
      // Should include UTC timezone indicator
      expect(html).toMatch(/UTC/);
    });
  });

  describe('renderMetaHTML - Event Series Type', () => {
    it('should render event-series meta tags correctly', () => {
      const mockSeries = {
        name: 'Weekly Book Club',
        slug: 'weekly-book-club',
        description: 'Discuss books every week',
        recurrenceDescription: 'Every Thursday',
      };

      const html = controller['renderMetaHTML']('event-series', mockSeries);

      expect(html).toContain('Weekly Book Club');
      expect(html).toContain('Every Thursday');
      expect(html).toContain('/event-series/weekly-book-club');
    });

    it('should prepend recurrence description to og:description for series', () => {
      const mockSeries = {
        name: 'Monthly Meetup',
        slug: 'monthly-meetup',
        description: 'A great networking event',
        recurrenceDescription: 'First Monday of every month',
      };

      const html = controller['renderMetaHTML']('event-series', mockSeries);

      // og:description should start with recurrence pattern
      expect(html).toMatch(
        /<meta property="og:description" content="First Monday of every month/,
      );
    });
  });
});
